"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeClassification, SceneManifestNode } from "@/lib/types";

type EffectiveClassification = NodeClassification | "unit_block";

const CLASSIFICATION_DOT: Record<EffectiveClassification, string> = {
  architecture: "bg-neutral-300",
  landscape: "bg-emerald-500",
  interaction: "bg-sky-500",
  helper: "bg-amber-500",
  unit_block: "bg-brand-500",
};

/**
 * Every GLB node from a version's `sceneManifest`, rendered as an indented
 * expand/collapse tree — Editor UX & Scene Structure pass (PRD §8). No
 * comparable component exists anywhere else in this app (confirmed by
 * search before building this), so this owns its own small, self-contained
 * interaction convention rather than adapting an unrelated one: a chevron
 * toggles children, clicking a row's name selects it (driving the
 * classification/material inspector rendered by the caller), a small dot
 * before the name shows its current classification at a glance, and a
 * second dot after the name marks "has a saved override" so Admin can spot
 * customized nodes while collapsed.
 */
export function SceneExplorerTree({
  manifest,
  selectedRzNodeId,
  onSelect,
  classificationOf,
  overriddenSet,
}: {
  manifest: SceneManifestNode[];
  selectedRzNodeId: string | null;
  onSelect: (rzNodeId: string) => void;
  classificationOf: (node: SceneManifestNode) => EffectiveClassification;
  overriddenSet: Set<string>;
}) {
  // Collapsed by default past the first level — most GLBs have a handful
  // of top-level groups (Architecture/Landscape/Units/...) and a lot of
  // depth underneath; starting fully expanded would just be a wall of rows.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, SceneManifestNode[]>();
    manifest.forEach((node) => {
      const key = node.parentRzNodeId;
      const list = map.get(key);
      if (list) list.push(node);
      else map.set(key, [node]);
    });
    return map;
  }, [manifest]);

  function toggle(rzNodeId: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(rzNodeId)) next.delete(rzNodeId);
      else next.add(rzNodeId);
      return next;
    });
  }

  function renderNode(node: SceneManifestNode) {
    const kids = childrenOf.get(node.rzNodeId) ?? [];
    const hasKids = kids.length > 0;
    const isExpanded = expanded.has(node.rzNodeId);
    return (
      <div key={node.rzNodeId}>
        <div
          className={cn(
            "flex items-center gap-1 rounded-control py-1 pr-2 text-xs",
            selectedRzNodeId === node.rzNodeId ? "bg-brand-50" : "hover:bg-neutral-50"
          )}
          style={{ paddingLeft: `${node.depth * 14 + 2}px` }}
        >
          {hasKids ? (
            <button
              type="button"
              onClick={() => toggle(node.rzNodeId)}
              aria-label={isExpanded ? "Collapse" : "Expand"}
              className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-700"
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onSelect(node.rzNodeId)}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
          >
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", CLASSIFICATION_DOT[classificationOf(node)])}
              aria-hidden="true"
            />
            <span className="truncate font-mono text-neutral-700">{node.name}</span>
            {overriddenSet.has(node.rzNodeId) && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            )}
          </button>
        </div>
        {hasKids && isExpanded && kids.map((child) => renderNode(child))}
      </div>
    );
  }

  const roots = childrenOf.get(null) ?? [];
  return <div className="max-h-64 space-y-0.5 overflow-y-auto scroll-thin">{roots.map((node) => renderNode(node))}</div>;
}
