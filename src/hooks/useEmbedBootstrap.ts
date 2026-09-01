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

const INVENTORY_POLL_MS = 30_000;

export function useEmbedBootstrap(publicKey: string): EmbedBootstrapState {
  const [state, setState] = useState<EmbedBootstrapState>({ status: "loading" });
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
        if (!res.ok) return;
        lastEtagRef.current = res.headers.get("etag");
        const body = (await res.json()) as InventoryResponse;
        const bootstrap = buildWhiteLabelBootstrap(projectRef.current, manifestRef.current, body.units);
        setState((prev) => (prev.status === "ready" ? { ...prev, bootstrap } : prev));
      } catch {
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
