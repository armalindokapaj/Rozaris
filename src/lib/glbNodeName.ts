/**
 * Some DCC export pipelines bake a non-semantic prefix onto every node
 * name ahead of the actual object name — the case that motivated this
 * file: a Blender "Layer" collection exports each member as
 * `Layer:Unit_001` instead of `Unit_001`, so it never matched the
 * `Unit_<code>` convention the platform looks for.
 *
 * Stripped once here, at the point each of the Unit_* consumers first
 * reads a node's raw name — glbValidate.ts (upload-time validation +
 * the stored sceneManifest), glbUnitNodes.ts (client-side Auto Detect),
 * and unitRegistry.ts/RenderEngine.ts (the live scene-graph lookups that
 * actually resolve a mesh<->Unit link and recolor a unit box) — so all
 * of them agree on the same name. Cleaning in only one of those places
 * would make detection and rendering disagree instead of fixing anything.
 * A name with no known prefix passes through unchanged, so this is a
 * no-op for every already-correctly-named `Unit_*` node.
 */
const KNOWN_NODE_NAME_PREFIXES: RegExp[] = [/^Layer:\s*/i];

export function cleanGlbNodeName(rawName: string): string {
  let name = rawName;
  for (const prefix of KNOWN_NODE_NAME_PREFIXES) {
    name = name.replace(prefix, "");
  }
  return name;
}
