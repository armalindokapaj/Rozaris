"use client";

import { forwardRef } from "react";
import { useProjectDetailModel } from "@/hooks/useProjectDetailModel";
import { ProceduralProjectViewer } from "./ProceduralProjectViewer";
import { MapboxProjectViewer } from "./MapboxProjectViewer";
import type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "./viewerTypes";

export type { ThreeProjectViewerHandle } from "./viewerTypes";

/**
 * Project 3D Experience — thin dispatcher between two engines, so callers
 * (ArchVizClient.tsx, Project3DConfigEditor.tsx) keep using one component
 * with one prop/ref contract regardless of which renders:
 *
 *  - MapboxProjectViewer: a live Mapbox map with Admin's detailed GLB
 *    placed at the project's real coordinates — used once a project has an
 *    enabled ProjectDetailModel (a real Postgres row, see
 *    useProjectDetailModel). This is where linked `Unit_<number>` boxes
 *    render, color-coded by status, behind the "Unit Search" bottom-bar
 *    toggle.
 *  - ProceduralProjectViewer: the original standalone Three.js viewer
 *    (procedural box-massing, lib/threeBuilding.ts) — the fallback for
 *    every project that hasn't uploaded/enabled a detailed model yet, so
 *    existing projects keep working unchanged.
 */
export const ThreeProjectViewer = forwardRef<ThreeProjectViewerHandle, ThreeProjectViewerProps>(
  function ThreeProjectViewer(props, ref) {
    const detailModel = useProjectDetailModel(props.project.id);
    if (detailModel?.enabled && detailModel.glbUrl) {
      return <MapboxProjectViewer {...props} detailModel={detailModel} ref={ref} />;
    }
    return <ProceduralProjectViewer {...props} ref={ref} />;
  }
);
