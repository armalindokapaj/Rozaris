"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useAppStore } from "@/lib/store";
import { SELECTED_UNIT_ZOOM } from "@/lib/constants";
import { useLiveListings } from "@/hooks/useLiveListings";
import { useLiveProjects } from "@/hooks/useLiveProjects";
import { getVisibleListings, getVisibleProjects } from "@/lib/filtering";
import { getNeighborhood, CITY_CENTER } from "@/lib/mockData";
import { projectUnitListingsFrom } from "@/lib/projects";
import type { Project } from "@/lib/types";
import {
  buildClusterMarker,
  buildListingMarker,
  buildProjectMarker,
} from "./markerFactory";
import { ProjectModelSource, type MapModelEntry } from "./ProjectModelSource";
import { computeProjectMassing } from "@/lib/threeBuilding";
import { BuildingHider, type BuildingFootprint } from "./BuildingHider";
import { MapControls } from "./MapControls";
import { MapFallback } from "./MapFallback";
import { ProjectPopupCard } from "./ProjectPopupCard";
import { BuildingPopupCard } from "./BuildingPopupCard";
import { UnitPopupCard } from "./UnitPopupCard";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

type ZoomTier = "cluster" | "icon" | "price";
export type MapCamera = { lat: number; lng: number; zoom: number; bearing: number; pitch: number };

function tierForZoom(z: number): ZoomTier {
  if (z < 13.3) return "cluster";
  if (z < 15.2) return "icon";
  return "price";
}

interface MapModelRow {
  projectId: string;
  glbUrl: string | null;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  lng: number;
  lat: number;
  enabled: boolean;
  hideBaseBuilding: boolean;
  hiddenBuildings: { lng: number; lat: number; footprint: BuildingFootprint | null; featureId?: string | number }[];
}

function useProjectMapModels(): Record<string, MapModelRow> {
  const [models, setModels] = useState<Record<string, MapModelRow>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/map-models");
        if (!res.ok || cancelled) return;
        const rows: MapModelRow[] = await res.json();
        const byProjectId: Record<string, MapModelRow> = {};
        rows.forEach((r) => {
          byProjectId[r.projectId] = r;
        });
        if (!cancelled) setModels(byProjectId);
      } catch {
      }
    }
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, []);

  return models;
}

export function MapView({
  className,
  controlsClassName,
  fullScreen = false,
  onToggleFullScreen,
  onSaveCamera,
  restoreCamera,
  restoreCameraToken = 0,
}: {
  className?: string;
  controlsClassName?: string;
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
  onSaveCamera?: (camera: MapCamera) => void;
  restoreCamera?: MapCamera | null;
  restoreCameraToken?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const modelLayerRef = useRef<ProjectModelSource | null>(null);
  const buildingHiderRef = useRef<BuildingHider | null>(null);
  const popupCardRef = useRef<HTMLDivElement>(null);

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState<ZoomTier>("cluster");
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);

  const filters = useAppStore((s) => s.filters);
  const mapBounds = useAppStore((s) => s.mapBounds);
  const mapAreaSearchBounds = useAppStore((s) => s.mapAreaSearchBounds);
  const liveListings = useAppStore((s) => s.liveListings);
  const liveProjects = useAppStore((s) => s.liveProjects);
  useLiveListings();
  useLiveProjects();
  const liveProjectsRef = useRef<Project[] | null>(null);
  useEffect(() => {
    liveProjectsRef.current = liveProjects;
  }, [liveProjects]);
  const setMapBounds = useAppStore((s) => s.setMapBounds);
  const selectedListingId = useAppStore((s) => s.selectedListingId);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectListing = useAppStore((s) => s.selectListing);
  const selectProject = useAppStore((s) => s.selectProject);
  const projectMapModels = useProjectMapModels();
  const flyToToken = useAppStore((s) => s.flyToToken);
  const flyToTarget = useAppStore((s) => s.flyToTarget);
  const setMode = useAppStore((s) => s.setMode);
  const searchThisMapArea = useAppStore((s) => s.searchThisMapArea);
  const clearMapAreaSearch = useAppStore((s) => s.clearMapAreaSearch);
  const priceFmt = usePriceFormat();
  const { t } = useT();

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const noTokenReason = !token ? t("map.addTokenHint") : null;
  const failReason = noTokenReason ?? webglFailReason;

  const visibleListings = useMemo(
    () =>
      getVisibleListings(
        filters,
        mapAreaSearchBounds ?? mapBounds,
        !!mapAreaSearchBounds,
        liveListings,
        liveProjects
      ),
    [filters, mapBounds, mapAreaSearchBounds, liveListings, liveProjects]
  );
  const visibleProjects = useMemo(
    () => getVisibleProjects(filters, mapAreaSearchBounds ?? mapBounds, !!mapAreaSearchBounds, liveProjects),
    [filters, mapBounds, mapAreaSearchBounds, liveProjects]
  );

  useEffect(() => {
    if (!containerRef.current || noTokenReason) return;
    if (!mapboxgl.supported()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWebglFailReason(t("map.noWebglBrowser"));
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/armalindokapaj/cmsqj4p0101ao01sd6911ckb4",
      center: [CITY_CENTER.lng, CITY_CENTER.lat],
      zoom: 12.4,
      pitch: 55,
      bearing: -14,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      setReady(true);
      setMapInstance(map);
      const b = map.getBounds();
      if (b) {
        setMapBounds({
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        });
      }
      setTier(tierForZoom(map.getZoom()));

      modelLayerRef.current = new ProjectModelSource(map, {
        onPick: (projectId) => {
          const project = liveProjectsRef.current?.find((p) => p.id === projectId);
          if (project) window.open(`/project/${project.slug}`, "_blank", "noopener");
        },
        onLoadError: (projectId, error) => {
          console.error(`3D Map Control: failed to load GLB for project "${projectId}"`, error);
        },
      });
      buildingHiderRef.current = new BuildingHider(map);
    });

    let debounceHandle: ReturnType<typeof setTimeout> | null = null;
    map.on("moveend", () => {
      if (debounceHandle) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        const b = map.getBounds();
        if (b) {
          setMapBounds({
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          });
        }
      }, 300);
    });

    map.on("zoom", () => setTier(tierForZoom(map.getZoom())));

    map.on("click", (e) => {
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest(".mapboxgl-marker")) return;
      selectListing(null);
      selectProject(null);
    });

    return () => {
      buildingHiderRef.current?.destroy();
      buildingHiderRef.current = null;
      modelLayerRef.current?.destroy();
      modelLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const mapModelEntries = useMemo<MapModelEntry[]>(() => {
    if (tier === "cluster") return [];
    return visibleProjects.flatMap((p): MapModelEntry[] => {
      const model = projectMapModels[p.id];
      if (model?.enabled && model.glbUrl) {
        return [
          {
            projectId: p.id,
            glbUrl: model.glbUrl,
            lng: model.lng,
            lat: model.lat,
            scale: model.scale,
            rotationDeg: model.rotationDeg,
            altitudeOffset: model.altitudeOffset,
            pickMassing: computeProjectMassing(p),
          },
        ];
      }
      const massing = computeProjectMassing(p);
      if (massing.length === 0) return [];
      return [{
        projectId: p.id,
        massing,
        lng: p.coords.lng,
        lat: p.coords.lat,
        scale: 1,
        rotationDeg: 0,
        altitudeOffset: 0,
      }];
    });
  }, [visibleProjects, projectMapModels, tier]);

  const buildingHideTargets = useMemo(() => {
    return visibleProjects.flatMap((p) => {
      const model = projectMapModels[p.id];
      if (!model?.enabled || !model.glbUrl || !model.hideBaseBuilding) return [];
      return model.hiddenBuildings.map((b, i) => ({
        key: `${p.id}-${i}`,
        lng: b.lng,
        lat: b.lat,
        footprint: b.footprint,
      }));
    });
  }, [visibleProjects, projectMapModels]);

  useEffect(() => {
    if (!ready) return;
    buildingHiderRef.current?.setTargets(buildingHideTargets);
  }, [ready, buildingHideTargets]);

  useEffect(() => {
    if (!ready) return;
    modelLayerRef.current?.setEntries(mapModelEntries);
  }, [ready, mapModelEntries]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!mapRef.current || !flyToTarget || flyToToken === 0) return;
    const center = mapRef.current.getCenter();
    onSaveCamera?.({ lat: center.lat, lng: center.lng, zoom: mapRef.current.getZoom(), bearing: mapRef.current.getBearing(), pitch: mapRef.current.getPitch() });
    mapRef.current.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom ?? 15,
      duration: 900,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToToken, onSaveCamera]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !restoreCamera || restoreCameraToken === 0) return;
    map.flyTo({ center: [restoreCamera.lng, restoreCamera.lat], zoom: restoreCamera.zoom, bearing: restoreCamera.bearing, pitch: restoreCamera.pitch, duration: 700, essential: true });
  }, [restoreCameraToken, restoreCamera]);

  useEffect(() => {
    const map = mapRef.current;
    const isUnitSelected = !!(selectedListingId || selectedProjectId);
    if (!map || !ready || !isUnitSelected) return;

    const DEG_PER_SEC = 1.2;
    let raf = 0;
    let lastTs: number | null = null;

    function tick(ts: number) {
      if (map && !map.isMoving()) {
        if (lastTs != null) {
          const dt = (ts - lastTs) / 1000;
          map.setBearing(map.getBearing() + DEG_PER_SEC * dt);
        }
        lastTs = ts;
      } else {
        lastTs = null;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    function stopRotation() {
      cancelAnimationFrame(raf);
    }
    map.once("dragstart", stopRotation);
    map.once("wheel", stopRotation);
    map.once("touchstart", stopRotation);

    return () => {
      cancelAnimationFrame(raf);
      map.off("dragstart", stopRotation);
      map.off("wheel", stopRotation);
      map.off("touchstart", stopRotation);
    };
  }, [ready, selectedListingId, selectedProjectId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const modeledProjectIds = new Set(mapModelEntries.map((e) => e.projectId));
    visibleProjects
      .filter((project) => !modeledProjectIds.has(project.id))
      .forEach((project) => {
      const el = buildProjectMarker({
        selected: project.id === selectedProjectId,
        premium: project.premium,
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectProject(project.id);
        map.easeTo({
          center: [project.coords.lng, project.coords.lat],
          zoom: Math.max(map.getZoom(), SELECTED_UNIT_ZOOM),
          duration: 500,
        });
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([project.coords.lng, project.coords.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    const standaloneListings = visibleListings.filter((l) => !l.fromProjectSlug);

    if (tier === "cluster") {
      const counts = new Map<string, number>();
      standaloneListings.forEach((l) =>
        counts.set(l.neighborhoodId, (counts.get(l.neighborhoodId) ?? 0) + 1)
      );
      counts.forEach((count, nId) => {
        const n = getNeighborhood(nId);
        if (!n) return;
        const el = buildClusterMarker(n.name, count);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          useAppStore
            .getState()
            .requestFlyTo({ lat: n.coords.lat, lng: n.coords.lng, zoom: 15 });
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([n.coords.lng, n.coords.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
    } else {
      standaloneListings.forEach((listing) => {
        const isSelected = listing.id === selectedListingId;
        const el = buildListingMarker({
          tier,
          priceLabel: priceFmt(listing.price, { compact: true }),
          viewUnitLabel: t("results.viewUnit"),
          premium: listing.premium,
          selected: isSelected,
          propertyType: listing.propertyType,
          buildingCount: listing.buildingListingCount,
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (tier === "price" && isSelected) {
            window.location.href = `/listing/${listing.slug}`;
            return;
          }
          selectListing(listing.id);
          map.easeTo({
            center: [listing.coords.lng, listing.coords.lat],
            zoom: Math.max(map.getZoom(), SELECTED_UNIT_ZOOM),
            duration: 500,
          });
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([listing.coords.lng, listing.coords.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
    }
  }, [
    ready,
    tier,
    visibleListings,
    visibleProjects,
    mapModelEntries,
    selectedListingId,
    selectedProjectId,
    selectListing,
    selectProject,
    priceFmt,
    t,
  ]);

  const activeProject = selectedProjectId
    ? (liveProjects ?? []).find((p) => p.id === selectedProjectId) ?? null
    : null;
  const activeBuildingListing =
    !activeProject && selectedListingId
      ? (liveListings ?? []).find(
          (l) =>
            l.id === selectedListingId &&
            !l.fromProjectSlug &&
            (l.buildingListingCount ?? 0) > 1
        ) ?? null
      : null;
  const activeProjectUnit =
    !activeProject && !activeBuildingListing && selectedListingId
      ? projectUnitListingsFrom(liveProjects ?? []).find(
          (l) => l.id === selectedListingId && l.fromProjectSlug
        ) ?? null
      : null;
  const activeCoords =
    activeProject?.coords ?? activeBuildingListing?.coords ?? activeProjectUnit?.coords ?? null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeCoords) {
      setPopupPos(null);
      return;
    }
    const update = () => {
      const p = map.project([activeCoords.lng, activeCoords.lat]);
      const card = popupCardRef.current;
      if (card) {
        card.style.left = `${p.x}px`;
        card.style.top = `${p.y}px`;
      } else {
        setPopupPos({ x: p.x, y: p.y });
      }
    };
    update();
    map.on("move", update);
    return () => {
      map.off("move", update);
    };
  }, [activeCoords]);

  return (
    <div className="relative h-full w-full">
      {failReason ? (
        <div className={cn("h-full w-full overflow-hidden bg-neutral-100", className)}>
          <MapFallback
            reason={failReason}
            actionLabel={t("map.browsePropertiesAsList")}
            onAction={() => setMode("list")}
          />
        </div>
      ) : (
        <>
          {                                                                 
                                                     }
          <div className={cn("absolute inset-0 overflow-hidden bg-neutral-100", className)}>
            <div ref={containerRef} className="h-full w-full" />
            <div className="cloud-texture" aria-hidden="true" />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-500" />
              </div>
            )}
          </div>
          <MapControls
            map={mapInstance}
            fullScreen={fullScreen}
            onToggleFullScreen={onToggleFullScreen}
            className={cn("absolute right-3 top-3 z-20", controlsClassName)}
          />
          <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 overflow-hidden rounded-control border border-neutral-200 bg-white shadow-[var(--shadow-1)] sm:top-4">
            <button
              onClick={searchThisMapArea}
              className="flex h-10 items-center whitespace-nowrap px-3 text-xs font-bold text-neutral-800 hover:bg-neutral-50 hover:text-brand-600 sm:h-11 sm:px-4 sm:text-sm"
            >
              {t("map.searchHere")}
            </button>
            {mapAreaSearchBounds && (
              <button
                onClick={clearMapAreaSearch}
                aria-label={t("map.clearAreaSearch")}
                className="flex h-10 w-9 items-center justify-center border-l border-neutral-200 text-lg font-medium text-neutral-500 hover:bg-neutral-50 hover:text-brand-600 sm:h-11"
              >
                ×
              </button>
            )}
          </div>
          {activeProject && popupPos && (
            <ProjectPopupCard
              ref={popupCardRef}
              project={activeProject}
              style={{ left: popupPos.x, top: popupPos.y }}
              onClose={() => selectProject(null)}
            />
          )}
          {activeBuildingListing && popupPos && (
            <BuildingPopupCard
              ref={popupCardRef}
              listing={activeBuildingListing}
              siblingCount={activeBuildingListing.buildingListingCount ?? 1}
              style={{ left: popupPos.x, top: popupPos.y }}
              onClose={() => selectListing(null)}
              onViewListing={() => {
                window.location.href = `/listing/${activeBuildingListing.slug}`;
              }}
            />
          )}
          {activeProjectUnit && popupPos && (
            <UnitPopupCard
              ref={popupCardRef}
              listing={activeProjectUnit}
              style={{ left: popupPos.x, top: popupPos.y }}
              onClose={() => selectListing(null)}
              onViewUnit={() => {
                window.location.href = `/listing/${activeProjectUnit.slug}`;
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
