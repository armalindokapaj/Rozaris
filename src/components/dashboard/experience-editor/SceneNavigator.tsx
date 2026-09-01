"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, Search, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SceneNode {
  id: string;
  label: string;
  children?: SceneNode[];
}

function buildTree(slotNames: string[]): SceneNode[] {
  return [
    {
      id: "project",
      label: "Project",
      children: [
        {
          id: "buildings",
          label: "Buildings",
          children: slotNames.length
            ? slotNames.map((name, i) => ({ id: `building-${i}`, label: name }))
            : [{ id: "building-empty", label: "(none uploaded yet)" }],
        },
        { id: "floors", label: "Floors" },
        { id: "units", label: "Units" },
        { id: "landscape", label: "Landscape" },
        { id: "water", label: "Water" },
        { id: "lights", label: "Lights" },
        { id: "cameras", label: "Cameras" },
        { id: "helpers", label: "Helpers" },
      ],
    },
  ];
}

const LAYERS = ["Architecture", "Units", "Landscape", "Water", "Context", "Amenities", "Lights", "Helpers"];

function TreeRow({ node, depth, filter }: { node: SceneNode; depth: number; filter: string }) {
  const [open, setOpen] = useState(depth < 2);
  const [hidden, setHidden] = useState(false);
  const [locked, setLocked] = useState(false);
  const hasChildren = !!node.children?.length;

  const matches =
    !filter ||
    node.label.toLowerCase().includes(filter) ||
    (node.children?.some((c) => c.label.toLowerCase().includes(filter)) ?? false);
  if (!matches) return null;

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded px-1.5 py-1 text-xs text-neutral-300 hover:bg-neutral-900"
        style={{ paddingLeft: depth * 14 + 6 }}
      >
        <button
          onClick={() => hasChildren && setOpen((v) => !v)}
          className={cn("shrink-0", !hasChildren && "invisible")}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        <button
          onClick={() => setHidden((v) => !v)}
          className="shrink-0 text-neutral-500 opacity-0 hover:text-neutral-200 group-hover:opacity-100"
          title={hidden ? "Show" : "Hide"}
        >
          {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
        <button
          onClick={() => setLocked((v) => !v)}
          className="shrink-0 text-neutral-500 opacity-0 hover:text-neutral-200 group-hover:opacity-100"
          title={locked ? "Unlock" : "Lock"}
        >
          {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        </button>
      </div>
      {open && hasChildren && node.children!.map((c) => <TreeRow key={c.id} node={c} depth={depth + 1} filter={filter} />)}
    </div>
  );
}

export function SceneNavigator({ slotNames }: { slotNames: string[] }) {
  const [search, setSearch] = useState("");
  const tree = buildTree(slotNames);
  const filter = search.trim().toLowerCase();

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Scene</span>
      </div>
      <div className="px-2 pb-2">
        <div className="flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scene..."
            className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {tree.map((node) => (
          <TreeRow key={node.id} node={node} depth={0} filter={filter} />
        ))}
      </div>
      <div className="border-t border-neutral-800 px-2 py-2">
        <p className="mb-1 px-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600">Layers</p>
        <div className="flex flex-wrap gap-1 px-1">
          {LAYERS.map((layer) => (
            <span key={layer} className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-400">
              {layer}
            </span>
          ))}
          <button className="rounded border border-dashed border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-600 hover:border-neutral-700 hover:text-neutral-400">
            + Add Layer
          </button>
        </div>
      </div>
    </aside>
  );
}
