"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useAppStore } from "@/lib/store";
import { SELECTED_UNIT_ZOOM } from "@/lib/constants";
import { getVisibleListings, getVisibleProjects } from "@/lib/filtering";
import { getNeighborhood, searchableListings, projects, CITY_CENTER } from "@/lib/mockData";
import {
  buildClusterMarker,
  buildListingMarker,
  buildProjectMarker,
} from "./markerFactory";
import { ProjectModelLayer, type MapModelEntry } from "./ProjectModelLayer";
import { BuildingHider } from "./BuildingHider";
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
  glbUrl: string;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  enabled: boolean;
  hideBaseBuilding: boolean;
  hiddenBuildingLng: number | null;
  hiddenBuildingLat: number | null;
}

/** "3D Map Control" placement, keyed by project id — a real, shared Postgres
 * row (src/app/api/map-models) rather than one browser's localStorage, so a
 * model an admin publishes shows up for every visitor. Refetches on window
 * focus (no realtime/websocket layer yet) so an admin's edit in another tab
 * shows up here without a full page reload. */
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
        // Offline/unreachable — the map just falls back to flat pins for
        // every project until the next successful fetch.
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
  const modelLayerRef = useRef<ProjectModelLayer | null>(null);
  const buildingHiderRef = useRef<BuildingHider | null>(null);

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState<ZoomTier>("cluster");
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  // WebGL support can only be detected client-side; the token check below is
  // a build-time constant so it's derived at render time instead of state.
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);

  const filters = useAppStore((s) => s.filters);
  const mapBounds = useAppStore((s) => s.mapBounds);
  const mapAreaSearchBounds = useAppStore((s) => s.mapAreaSearchBounds);
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

  // Bounds affect the dataset only after the visitor explicitly commits the
  // visible area with Search here; ordinary panning remains exploratory.
  const visibleListings = useMemo(
    () => getVisibleListings(filters, mapAreaSearchBounds ?? mapBounds, !!mapAreaSearchBounds),
    [filters, mapBounds, mapAreaSearchBounds]
  );
  const visibleProjects = useMemo(
    () => getVisibleProjects(filters, mapAreaSearchBounds ?? mapBounds, !!mapAreaSearchBounds),
    [filters, mapBounds, mapAreaSearchBounds]
  );

  // --- Initialize map once ---
  useEffect(() => {
    if (!containerRef.current || noTokenReason) return;
    if (!mapboxgl.supported()) {
      // Capability can only be known once running in the browser — a
      // legitimate, one-time synchronous effect update.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWebglFailReason(t("map.noWebglBrowser"));
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/armalindokapaj/cms9jpj8b008x01s9g1fib0f7",
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

      // "3D Map Control" — Admin-uploaded GLBs (real Vercel Blob URLs, see
      // MapModelEditor.tsx) plotted as real georeferenced models rather than
      // flat pins (see ProjectModelLayer.ts doc comment).
      const modelLayer = new ProjectModelLayer({
        onPick: (projectId) => {
          const project = projects.find((p) => p.id === projectId);
          if (project) window.open(`/project/${project.slug}`, "_blank", "noopener");
        },
        onLoadError: (projectId, error) => {
          console.error(`3D Map Control: failed to load GLB for project "${projectId}"`, error);
        },
      });
      map.addLayer(modelLayer);
      modelLayerRef.current = modelLayer;
      buildingHiderRef.current = new BuildingHider(map);
    });

    let debounceHandle: ReturnType<typeof setTimeout> | null = null;
    map.on("moveend", () => {
      if (debounceHandle) clearTimeout(debounceHandle);
      // MAP-007: 250-500ms debounce before spatial queries settle.
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
      // Defensive: a marker's own click handler already stops propagation,
      // but skip deselecting here too if the click somehow still targeted
      // a marker element.
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest(".mapboxgl-marker")) return;
      selectListing(null);
      selectProject(null);
    });

    return () => {
      buildingHiderRef.current?.destroy();
      buildingHiderRef.current = null;
      map.remove();
      mapRef.current = null;
      modelLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // --- 3D Map Control: reconcile which projects' GLBs are placed on the map ---
  const mapModelEntries = useMemo<MapModelEntry[]>(() => {
    return visibleProjects.flatMap((p) => {
      const model = projectMapModels[p.id];
      if (!model?.enabled || !model.glbUrl) return [];
      return [
        {
          projectId: p.id,
          glbUrl: model.glbUrl,
          lng: p.coords.lng,
          lat: p.coords.lat,
          scale: model.scale,
          rotationDeg: model.rotationDeg,
          altitudeOffset: model.altitudeOffset,
        },
      ];
    });
  }, [visibleProjects, projectMapModels]);

  const buildingHideTargets = useMemo(() => {
    return visibleProjects.flatMap((p) => {
      const model = projectMapModels[p.id];
      if (!model?.enabled || !model.glbUrl || !model.hideBaseBuilding) return [];
      // A manually picked building (Admin's "Pick Building to Remove")
      // takes priority over the project's own coordinates — the project
      // pin doesn't always sit exactly on the footprint that needs hiding.
      const lng = model.hiddenBuildingLng ?? p.coords.lng;
      const lat = model.hiddenBuildingLat ?? p.coords.lat;
      return [{ key: p.id, lng, lat }];
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

  // --- Keep map sized to its container across layout mode changes (PER-007) ---
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // --- Search-driven fly-to ---
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

  // --- Slow auto-rotate while a unit is selected ---
  // A gentle bearing drift while a listing/project is focused, so the
  // camera doesn't just sit static on the selection. Cancels the instant
  // the user actually touches the map (drag/wheel/pinch) rather than
  // fighting their input, and stops outright once nothing is selected.
  useEffect(() => {
    const map = mapRef.current;
    const isUnitSelected = !!(selectedListingId || selectedProjectId);
    if (!map || !ready || !isUnitSelected) return;

    const DEG_PER_SEC = 1.2;
    let raf = 0;
    let lastTs: number | null = null;

    function tick(ts: number) {
      // setBearing (like every camera method) calls the map's internal
      // stop() first, which would abort the selection's own flyTo/easeTo
      // mid-flight — skip ticking while the camera is already animating
      // (isMoving covers both, whether user- or code-driven) and resume
      // once it settles, instead of fighting it.
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

  // --- Marker reconciliation ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Projects get a marker pinned to the map at every zoom tier — unlike
    // listings, they never fold into a neighborhood cluster count. Keeping
    // them out of that tier switch means the pin doesn't pop away and
    // reappear (feeling laggy) as you cross the cluster/icon zoom threshold.
    // A project with a live 3D Map Control model (mapModelEntries) renders
    // as that real GLB instead — the flat pin would just duplicate it.
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
        // Same fix as the listing marker below: selectProject already
        // clears selectedListingId itself.
        selectProject(project.id);
        map.easeTo({
          center: [project.coords.lng, project.coords.lat],
          zoom: Math.max(map.getZoom(), SELECTED_UNIT_ZOOM),
          duration: 500,
        });
      });
      // anchor: "center" (not "bottom") so the coordinate sits at the
      // marker's exact visual middle — otherwise easeTo/flyTo's `center`
      // lands the coordinate at the map's center pixel while the marker's
      // body, hanging above a bottom anchor, renders visibly off-center.
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([project.coords.lng, project.coords.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    // Listings synthesized from a New Project's units already get that
    // project's own marker above — plotting them individually too would
    // just duplicate the same pin and clutter the map, so only standalone
    // listings get their own marker/cluster here.
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
          // First click centers this listing on the map and swaps the
          // mini card's price for "View Unit" — a second click on the
          // now-selected marker is what actually navigates.
          if (tier === "price" && isSelected) {
            window.location.href = `/listing/${listing.slug}`;
            return;
          }
          // selectListing already clears selectedProjectId itself — do not
          // also call selectProject(null) here, since that action's own
          // reciprocal clearing (selectedListingId: null) would immediately
          // wipe out the selection just made, one tick later.
          selectListing(listing.id);
          map.easeTo({
            center: [listing.coords.lng, listing.coords.lat],
            zoom: Math.max(map.getZoom(), SELECTED_UNIT_ZOOM),
            duration: 500,
          });
        });
        // anchor: "center" — see the project marker above for why.
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

  // --- Popup positioning (tracks camera moves while a popup is open) ---
  const activeProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId) ?? null
    : null;
  // A building with multiple independent (non-project) listings — excludes
  // project units explicitly, even though those never set buildingListingCount
  // anyway, since they get their own dedicated popup below instead.
  const activeBuildingListing =
    !activeProject && selectedListingId
      ? searchableListings.find(
          (l) =>
            l.id === selectedListingId &&
            !l.fromProjectSlug &&
            (l.buildingListingCount ?? 0) > 1
        ) ?? null
      : null;
  // A specific unit belonging to a New Project, selected from the results
  // list — the project's marker is the only pin plotted at its location, so
  // this popup is the only way the map shows *which* unit is selected
  // (rather than falling back to the generic project overview popup).
  const activeProjectUnit =
    !activeProject && !activeBuildingListing && selectedListingId
      ? searchableListings.find(
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
      setPopupPos({ x: p.x, y: p.y });
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
          {/* Rounded-corner clipping lives on this inner wrapper only — the
              canvas/texture/spinner need it, but controls and popups sit
              on the outer (unclipped) root below so a popup near the top
              edge of the map isn't cut off by it. */}
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
              project={activeProject}
              style={{ left: popupPos.x, top: popupPos.y }}
              onClose={() => selectProject(null)}
            />
          )}
          {activeBuildingListing && popupPos && (
            <BuildingPopupCard
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
