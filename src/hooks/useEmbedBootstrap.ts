"use client";

import { useEffect, useRef, useState } from "react";
import { buildWhiteLabelBootstrap } from "@/lib/viewer/manifestAdapter";
import type { ViewerReleaseManifest } from "@/lib/publishing/compileRelease";
import type { PublicUnitDto } from "@/lib/viewer/inventoryDto";
import type { ProjectViewerRuntimeBootstrap } from "@/lib/viewer/runtimeTypes";
import type { Project } from "@/lib/types";

interface BootstrapResponse {
  target: {
    publicKey: string;
    type: string;
    branding: Record<string, unknown> | null;
    viewerOverrides: Record<string, unknown> | null;
  };
  project: Omit<Project, "units">;
  release: { id: string; version: number; manifestHash: string; manifestUrl: string };
  inventory: { revision: string; url: string };
}

interface InventoryResponse {
  revision: string;
  units: PublicUnitDto[];
}

export type EmbedBootstrapState =
  | { status: "loading" }
  | { status: "error"; error: string; httpStatus: number }
  | {
      status: "ready";
      bootstrap: ProjectViewerRuntimeBootstrap;
      branding: Record<string, unknown> | null;
      viewerOverrides: Record<string, unknown> | null;
    };

// Same cadence as useProjectUnits.ts's UNIT_STATUS_POLL_MS — a white-label
// visitor should see a status change about as promptly as a marketplace
// one. Uses the ETag/If-None-Match Phase 6 actually built this endpoint
// for (unlike useProjectUnits's full refetch), so a quiet project costs
// one 304 with no body per tick, not a full unit list re-fetch.
const INVENTORY_POLL_MS = 30_000;

/**
 * Multi-Channel Publishing PRD Phase 5 — the white-label half of what
 * `MarketplaceViewer`'s 4 live hooks do, but against the public
 * `/api/viewer/v1/t/[publicKey]/*` surface (Phase 5/6's backend, already
 * curl-verified) instead of admin-facing project APIs: one bootstrap
 * fetch, one immutable manifest fetch (cached forever by `releaseId` —
 * never refetched for the life of this hook instance), then a polled,
 * `ETag`-aware inventory fetch that patches `bootstrap.units`/
 * `bootstrap.project.units` in place without re-fetching the manifest or
 * project metadata.
 */
export function useEmbedBootstrap(publicKey: string): EmbedBootstrapState {
  const [state, setState] = useState<EmbedBootstrapState>({ status: "loading" });
  // Not component state — driving a poll loop off it would need to be in
  // every effect's dep array and would restart the interval on every
  // inventory tick. Mutable ref instead, same reasoning `viewerRef`/
  // `mainRef` already use elsewhere in this runtime for values effects
  // need to read but shouldn't re-run because of.
  const lastEtagRef = useRef<string | null>(null);
  const projectRef = useRef<Omit<Project, "units"> | null>(null);
  const manifestRef = useRef<ViewerReleaseManifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;

    async function fail(res: Response) {
      let error = `Request failed (HTTP ${res.status}).`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) error = body.error;
      } catch {
        // Non-JSON error body — keep the generic message above.
      }
      if (!cancelled) setState({ status: "error", error, httpStatus: res.status });
    }

    async function pollInventory() {
      if (!projectRef.current || !manifestRef.current) return;
      try {
        const res = await fetch(`/api/viewer/v1/t/${publicKey}/inventory`, {
          headers: lastEtagRef.current ? { "If-None-Match": lastEtagRef.current } : {},
        });
        if (res.status === 304 || cancelled) return;
        if (!res.ok) return; // A transient inventory-poll failure shouldn't tear down an already-rendering viewer.
        lastEtagRef.current = res.headers.get("etag");
        const body = (await res.json()) as InventoryResponse;
        const bootstrap = buildWhiteLabelBootstrap(projectRef.current, manifestRef.current, body.units);
        setState((prev) => (prev.status === "ready" ? { ...prev, bootstrap } : prev));
      } catch {
        // Same reasoning as the !res.ok branch above — a network blip on
        // a poll tick shouldn't be treated as fatal for an already-loaded
        // viewer.
      }
    }

    async function load() {
      const bootRes = await fetch(`/api/viewer/v1/t/${publicKey}/bootstrap`);
      if (cancelled) return;
      if (!bootRes.ok) return fail(bootRes);
      const boot = (await bootRes.json()) as BootstrapResponse;

      const manifestRes = await fetch(boot.release.manifestUrl);
      if (cancelled) return;
      if (!manifestRes.ok) return fail(manifestRes);
      const manifest = (await manifestRes.json()) as ViewerReleaseManifest;

      const inventoryRes = await fetch(boot.inventory.url);
      if (cancelled) return;
      if (!inventoryRes.ok) return fail(inventoryRes);
      lastEtagRef.current = inventoryRes.headers.get("etag");
      const inventory = (await inventoryRes.json()) as InventoryResponse;

      projectRef.current = boot.project;
      manifestRef.current = manifest;
      const bootstrap = buildWhiteLabelBootstrap(boot.project, manifest, inventory.units);
      if (cancelled) return;
      setState({ status: "ready", bootstrap, branding: boot.target.branding, viewerOverrides: boot.target.viewerOverrides });
      pollInterval = setInterval(pollInventory, INVENTORY_POLL_MS);
    }

    load().catch(() => {
      if (!cancelled) setState({ status: "error", error: "Could not load this viewer.", httpStatus: 0 });
    });

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [publicKey]);

  return state;
}
