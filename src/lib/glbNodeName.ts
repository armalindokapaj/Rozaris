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
 *
 * THE SEPARATOR IS NOT ALWAYS THERE (real bug, found live on Tower
 * Vlora): the four consumers above do NOT all read the same string.
 * glbValidate.ts parses the GLB's JSON chunk itself, so it sees the raw
 * authored name `Layer:Unit_001`. The other three read
 * `THREE.Object3D.name` out of a GLTFLoader-parsed scene — and
 * GLTFLoader runs every node name through
 * `PropertyBinding.sanitizeNodeName()`, which DELETES the characters
 * `[ ] . : /` outright (they're reserved for animation-track binding
 * syntax) and turns whitespace into `_`. So the exact same node reaches
 * the scene graph as `LayerUnit_001` — colon gone, no separator left.
 *
 * A prefix list that only matched `^Layer:` therefore worked server-side
 * and failed on the client, with two silent, user-visible consequences:
 *   1. Auto Detect found ZERO `Unit_*` nodes (`LayerUnit_001` doesn't
 *      match `/^Unit_/i`), so the Units tab's Mapping list rendered
 *      empty and an admin had nothing to manually map — while the
 *      server-built sceneManifest for the very same upload correctly
 *      listed all three unit blocks.
 *   2. Materials-tab node overrides never resolved either, since
 *      RenderEngine keys them off the sceneManifest's cleaned names and
 *      compares against these sanitized runtime names.
 *
 * Both forms are matched below. The bare (separator-less) form is
 * deliberately conservative — it only strips when what follows looks
 * like a real object name rather than the rest of an ordinary word, so
 * `Layered` is left alone while `LayerUnit_001` and `LayerFacade` are
 * cleaned. A mesh genuinely named `LayerCake` would be over-stripped;
 * that's the accepted trade for making prefixed exports work at all,
 * and it's why the payload must start with an uppercase letter or `_`.
 */
const KNOWN_PREFIX_WORDS = ["Layer"] as const;

const KNOWN_NODE_NAME_PREFIXES: RegExp[] = KNOWN_PREFIX_WORDS.flatMap((word) => [
  // Raw authored form, as read straight from the glTF JSON chunk
  // server-side: `Layer:Unit_001`, `Layer: Unit_001`, and the `Layer_`
  // variant a whitespace-only separator collapses into.
  new RegExp(`^${word}[:_]\\s*`, "i"),
  // GLTFLoader-sanitized form, as seen on THREE.Object3D.name: the
  // separator is gone, so the payload's own first character is the only
  // boundary left to key on.
  new RegExp(`^${word}(?=[A-Z_])`),
  // Same sanitized form, but tolerant of a lowercased collection name
  // (`layer:unit_001` -> `layerunit_001`). Scoped to the platform's own
  // `Unit_` convention so it can't over-strip anything else.
  new RegExp(`^${word}(?=unit_)`, "i"),
]);

export function cleanGlbNodeName(rawName: string): string {
  let name = rawName;
  for (const prefix of KNOWN_NODE_NAME_PREFIXES) {
    name = name.replace(prefix, "");
  }
  return name;
}

/**
 * GLTFLoader-equivalent sanitization, replicated here so SERVER-side code
 * can compare a name it read straight from the GLB's JSON chunk against a
 * name that was authored/stored through a client that only ever saw the
 * loader-parsed scene graph. Mirrors three.js's
 * `PropertyBinding.sanitizeNodeName()` exactly: whitespace becomes `_`,
 * and the animation-binding reserved characters `[ ] . : /` are DELETED.
 */
export function sanitizeGlbNodeName(rawName: string): string {
  return rawName.replace(/\s/g, "_").replace(/[[\].:/]/g, "");
}

/**
 * A single normalized key for "these two strings name the same GLB node,"
 * used ONLY for matching — never for storage or display.
 *
 * Why it exists: a stored `UnitMeshLinkV2.meshName` is whichever spelling
 * the admin's editor happened to show when they linked it, and that is not
 * always the spelling the server reads back out of the next GLB. The
 * upload path reads the raw glTF JSON (`Unit.001`), while everything that
 * walks a loaded scene sees the sanitized form (`Unit001`). Matching those
 * with `===` — which is what the carry-forward on GLB replacement used to
 * do — silently drops the link and hands the admin an unmapped model to
 * redo by hand, which is exactly the work carry-forward exists to save.
 * Case is folded too, since node names are authored by hand in a DCC tool
 * and a re-export that flips `unit_001`/`Unit_001` is not a rename.
 */
export function glbNodeNameKey(rawName: string): string {
  return sanitizeGlbNodeName(cleanGlbNodeName(rawName)).toLowerCase();
}
