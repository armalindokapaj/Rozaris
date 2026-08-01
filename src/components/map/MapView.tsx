"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useAppStore } from "@/lib/store";
import { getVisibleListings, getVisibleProjects } from "@/lib/filtering";
import { getNeighborhood, listings, projects, CITY_CENTER } from "@/lib/mockData";
import {
  buildClusterMarker,
  buildListingMarker,
  buildProjectMarker,
} from "./markerFactory";
import { MapControls } from "./MapControls";
import { MapFallback } from "./MapFallback";
import { ProjectPopupCard } from "./ProjectPopupCard";
import { BuildingPopupCard } from "./BuildingPopupCard";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

type ZoomTier = "cluster" | "icon" | "price";

function tierForZoom(z: number): ZoomTier {
  if (z < 13.3) return "cluster";
  if (z < 15.2) return "icon";
  return "price";
}

export function MapView({
  className,
  controlsClassName,
}: {
  className?: string;
  controlsClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState<ZoomTier>("cluster");
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  // WebGL support can only be detected client-side; the token check below is
  // a build-time constant so it's derived at render time instead of state.
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);

  const filters = useAppStore((s) => s.filters);
  const mapBounds = useAppStore((s) => s.mapBounds);
  const setMapBounds = useAppStore((s) => s.setMapBounds);
  const selectedListingId = useAppStore((s) => s.selectedListingId);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectListing = useAppStore((s) => s.selectListing);
  const selectProject = useAppStore((s) => s.selectProject);
  const flyToToken = useAppStore((s) => s.flyToToken);
  const flyToTarget = useAppStore((s) => s.flyToTarget);
  const setMode = useAppStore((s) => s.setMode);
  const priceFmt = usePriceFormat();
  const { t } = useT();

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const noTokenReason = !token ? t("map.addTokenHint") : null;
  const failReason = noTokenReason ?? webglFailReason;

  const visibleListings = useMemo(
    () => getVisibleListings(filters, mapBounds, true),
    [filters, mapBounds]
  );
  const visibleProjects = useMemo(
    () => getVisibleProjects(filters, mapBounds, true),
    [filters, mapBounds]
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
      style: "mapbox://styles/mapbox/standard",
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

    map.on("click", () => {
      selectListing(null);
      selectProject(null);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    mapRef.current.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom ?? 15,
      duration: 900,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToToken]);

  // --- Marker reconciliation ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (tier === "cluster") {
      const counts = new Map<string, number>();
      visibleListings.forEach((l) =>
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
      visibleListings.forEach((listing) => {
        const el = buildListingMarker({
          tier,
          priceLabel: priceFmt(listing.price, { compact: true }),
          premium: listing.premium,
          selected: listing.id === selectedListingId,
          propertyType: listing.propertyType,
          buildingCount: listing.buildingListingCount,
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          selectListing(listing.id);
          selectProject(null);
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([listing.coords.lng, listing.coords.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });

      visibleProjects.forEach((project) => {
        const el = buildProjectMarker({
          selected: project.id === selectedProjectId,
          premium: project.premium,
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          selectProject(project.id);
          selectListing(null);
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([project.coords.lng, project.coords.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
    }
  }, [
    ready,
    tier,
    visibleListings,
    visibleProjects,
    selectedListingId,
    selectedProjectId,
    selectListing,
    selectProject,
    priceFmt,
  ]);

  // --- Popup positioning (tracks camera moves while a popup is open) ---
  const activeProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId) ?? null
    : null;
  const activeBuildingListing =
    !activeProject && selectedListingId
      ? listings.find(
          (l) => l.id === selectedListingId && (l.buildingListingCount ?? 0) > 1
        ) ?? null
      : null;
  const activeCoords = activeProject?.coords ?? activeBuildingListing?.coords ?? null;

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
    <div className={cn("relative h-full w-full overflow-hidden bg-neutral-100", className)}>
      {failReason ? (
        <MapFallback
          reason={failReason}
          actionLabel={t("map.browsePropertiesAsList")}
          onAction={() => setMode("list")}
        />
      ) : (
        <>
          <div ref={containerRef} className="h-full w-full" />
          <div className="cloud-texture" aria-hidden="true" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
              <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-500" />
            </div>
          )}
          <MapControls
            map={mapInstance}
            className={cn("absolute right-3 top-3 z-20", controlsClassName)}
          />
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
        </>
      )}
    </div>
  );
}
