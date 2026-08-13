"use client";

import { MATERIAL_PRESETS } from "@/lib/viewerPresets";
import type { MaterialPresetId, NodeClassification, NodeOverride, SceneManifestNode } from "@/lib/types";
import { SceneExplorerTree } from "../SceneExplorerTree";
import { ColorField, SliderField } from "./fields";
import type { SetOpts, Translate } from "./editorTypes";

const CLASSIFICATION_OPTIONS: NodeClassification[] = ["architecture", "landscape", "interaction", "helper"];
const MATERIAL_PRESET_OPTIONS: MaterialPresetId[] = Object.keys(MATERIAL_PRESETS) as MaterialPresetId[];

/**
 * Persistent scene-tree + contextual node inspector — moved verbatim from
 * Project3DConfigEditor.tsx's "Scene Explorer" block (1360-1464), which
 * used to be nested at the bottom of one long scroll and only ever
 * visible there. Now shown alongside whichever mode panel is active on
 * the Model/Materials/Units tabs (see modes.ts's MODES_WITH_SCENE_RAIL) —
 * same tree component (`SceneExplorerTree`, unchanged), same inspector
 * logic, just persistently positioned instead of buried.
 */
export function SceneTreeRail({
  sceneManifest,
  selectedNodeRzId,
  setSelectedNodeRzId,
  nodeOverrides,
  setNodeOverrides,
  linkedMeshNames,
  canEditDetail,
  t,
}: {
  sceneManifest: SceneManifestNode[];
  selectedNodeRzId: string | null;
  setSelectedNodeRzId: (id: string | null) => void;
  nodeOverrides: Record<string, NodeOverride>;
  setNodeOverrides: (
    v: Record<string, NodeOverride> | ((prev: Record<string, NodeOverride>) => Record<string, NodeOverride>),
    opts?: SetOpts
  ) => void;
  linkedMeshNames: Set<string>;
  canEditDetail: boolean;
  t: Translate;
}) {
  const selectedNode = sceneManifest.find((n) => n.rzNodeId === selectedNodeRzId) ?? null;

  if (sceneManifest.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
        {t("admin.sceneExplorerTitle")}
      </h4>
      <div className="rounded-control border border-neutral-200 p-1.5">
        <SceneExplorerTree
          manifest={sceneManifest}
          selectedRzNodeId={selectedNodeRzId}
          onSelect={setSelectedNodeRzId}
          overriddenSet={new Set(Object.keys(nodeOverrides))}
          classificationOf={(node) => {
            const override = nodeOverrides[node.rzNodeId];
            if (override?.classification) return override.classification;
            if (linkedMeshNames.has(node.name)) return "unit_block";
            return node.autoClassification;
          }}
        />
      </div>

      {selectedNode && (
        <div className="mt-2 space-y-2.5 rounded-control border border-brand-200 bg-brand-50/30 p-3">
          <p className="truncate font-mono text-xs font-semibold text-neutral-700">{selectedNode.name}</p>

          {linkedMeshNames.has(selectedNode.name) ? (
            <p className="text-[11px] text-neutral-500">{t("admin.sceneExplorerUnitBlockNote")}</p>
          ) : (
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {t("admin.sceneExplorerClassification")}
              </span>
              <select
                disabled={!canEditDetail}
                value={nodeOverrides[selectedNode.rzNodeId]?.classification ?? selectedNode.autoClassification}
                onChange={(e) => {
                  const classification = e.target.value as NodeClassification;
                  setNodeOverrides(
                    (s) => ({
                      ...s,
                      [selectedNode.rzNodeId]: {
                        ...(s[selectedNode.rzNodeId] ?? { rzNodeId: selectedNode.rzNodeId }),
                        classification,
                      },
                    }),
                    { commit: true }
                  );
                }}
                className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none disabled:opacity-50"
              >
                {CLASSIFICATION_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {t(`admin.sceneExplorerClass_${c}`)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              {t("admin.sceneExplorerMaterialPreset")}
            </span>
            <select
              disabled={!canEditDetail}
              value={nodeOverrides[selectedNode.rzNodeId]?.materialPreset ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setNodeOverrides(
                  (s) => ({
                    ...s,
                    [selectedNode.rzNodeId]: {
                      ...(s[selectedNode.rzNodeId] ?? { rzNodeId: selectedNode.rzNodeId }),
                      materialPreset: value ? (value as MaterialPresetId) : undefined,
                    },
                  }),
                  { commit: true }
                );
              }}
              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none disabled:opacity-50"
            >
              <option value="">{t("admin.sceneExplorerOriginalMaterial")}</option>
              {MATERIAL_PRESET_OPTIONS.map((id) => (
                <option key={id} value={id}>
                  {t(`admin.materialPreset_${id}`)}
                </option>
              ))}
            </select>
          </label>

          {/* Direct color/roughness/metalness/opacity overrides — these
              four NodeOverride fields were already read and applied by
              RenderEngine.ts's applyNodeOverrides (colorHex/roughness/
              metalness pre-existing, opacity added alongside this UI) but
              had no admin control anywhere; only reachable indirectly via
              the fixed Material Preset dropdown above. Each is optional —
              unset means "use the GLB's/preset's own value," same
              semantics as classification/materialPreset above, only
              written once the admin actually touches the control. */}
          <ColorField
            label={t("admin.sceneExplorerBaseColor")}
            value={nodeOverrides[selectedNode.rzNodeId]?.colorHex}
            onChange={(colorHex) =>
              setNodeOverrides(
                (s) => ({
                  ...s,
                  [selectedNode.rzNodeId]: {
                    ...(s[selectedNode.rzNodeId] ?? { rzNodeId: selectedNode.rzNodeId }),
                    colorHex,
                  },
                }),
                { commit: true }
              )
            }
          />
          <SliderField
            label={t("admin.sceneExplorerRoughness")}
            value={nodeOverrides[selectedNode.rzNodeId]?.roughness ?? 0.5}
            min={0}
            max={1}
            step={0.05}
            onChange={(roughness) =>
              setNodeOverrides(
                (s) => ({
                  ...s,
                  [selectedNode.rzNodeId]: {
                    ...(s[selectedNode.rzNodeId] ?? { rzNodeId: selectedNode.rzNodeId }),
                    roughness,
                  },
                }),
                { commit: true }
              )
            }
          />
          <SliderField
            label={t("admin.sceneExplorerMetalness")}
            value={nodeOverrides[selectedNode.rzNodeId]?.metalness ?? 0.5}
            min={0}
            max={1}
            step={0.05}
            onChange={(metalness) =>
              setNodeOverrides(
                (s) => ({
                  ...s,
                  [selectedNode.rzNodeId]: {
                    ...(s[selectedNode.rzNodeId] ?? { rzNodeId: selectedNode.rzNodeId }),
                    metalness,
                  },
                }),
                { commit: true }
              )
            }
          />
          <SliderField
            label={t("admin.sceneExplorerOpacity")}
            value={nodeOverrides[selectedNode.rzNodeId]?.opacity ?? 1}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(opacity) =>
              setNodeOverrides(
                (s) => ({
                  ...s,
                  [selectedNode.rzNodeId]: {
                    ...(s[selectedNode.rzNodeId] ?? { rzNodeId: selectedNode.rzNodeId }),
                    opacity,
                  },
                }),
                { commit: true }
              )
            }
          />

          {nodeOverrides[selectedNode.rzNodeId] && (
            <button
              type="button"
              disabled={!canEditDetail}
              onClick={() =>
                setNodeOverrides((s) => {
                  const next = { ...s };
                  delete next[selectedNode.rzNodeId];
                  return next;
                }, { commit: true })
              }
              className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
            >
              {t("admin.sceneExplorerResetToOriginal")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
