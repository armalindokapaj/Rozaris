import { prisma } from "@/lib/db";
import { cleanGlbNodeName, glbNodeNameKey } from "@/lib/glbNodeName";

/**
 * "Which GLB block is this unit?" — resolved SERVER-side, from the stored
 * `sceneManifest`, so a page that is not the 3D Configurator can offer the
 * mapping without loading a single byte of GLB.
 *
 * Why this exists at all: the only surface that could edit a
 * `UnitMeshLinkV2` was the Experience Editor's Units tab, and that tab is
 * gated on `canEditDetail = isDraftActive` (useDetailModelSlots.ts) while
 * `PUT .../versions/[versionId]/links` refuses a published version with a
 * 409. A project whose Units slot has exactly one version — published, the
 * normal end state — therefore had NO path to fix a wrong block→unit
 * binding short of re-uploading the GLB to mint a draft. That is not a
 * theoretical gap: Tower Vlora shipped with `Unit_002`→A-003 and
 * `Unit_003`→A-002 crossed, so clicking the block on floor 7 opened the
 * floor-8 listing, and nothing in the admin console could correct it.
 *
 * Deliberately NOT a second copy of the Units tab's logic: that one is
 * mesh-first (walk the GLB, offer a unit per mesh) because it runs next to
 * a loaded scene. This one is unit-first (a row per unit, offer a block)
 * because it runs inside an inventory grid, and it reads names out of the
 * manifest the upload already validated rather than re-deriving them.
 */

const UNIT_NODE_PATTERN = /^Unit_/i;

/** One `Unit_*` node of the resolved version's GLB. */
export interface UnitBlock {
  /** The name as stored in `sceneManifest` — the exact string written to
   * `UnitMeshLinkV2.meshName` when an admin picks this block. */
  meshName: string;
  /** The unit currently holding it, if any. */
  unitId: string | null;
}

export interface UnitBlockTarget {
  slot: { id: string; name: string; role: string };
  version: {
    id: string;
    version: number;
    publicationStatus: string;
    fileName: string;
  };
  blocks: UnitBlock[];
  /** Compiled `ViewerRelease` snapshots this project still serves. Their
   * manifests are frozen JSON, so embed and white-label channels keep the
   * OLD binding after a rebind while the marketplace page — which reads
   * `unitLinks` from Postgres on every load — gets the new one at once.
   * Counted so the UI can name that divergence instead of implying one
   * edit fixes every channel. */
  compiledReleaseCount: number;
  /** A draft newer than the version being edited, if any. This surface
   * deliberately writes the LIVE version (see `resolveLiveVersion`), so a
   * newer draft is left alone — but silently editing "the older one" would
   * be indistinguishable from the edit not working. */
  newerDraftVersion: number | null;
  /** Stored links whose `meshName` matches no node in this version's
   * manifest. Surfaced rather than silently dropped: a link like this is
   * live in the DB and the runtime may or may not resolve it (the manifest
   * holds the raw glTF spelling, the runtime sees the GLTFLoader-sanitized
   * one — see glbNodeName.ts), so hiding it would make the admin's own
   * mapping list disagree with what the viewer actually does. */
  orphanLinks: { meshName: string; unitId: string }[];
}

type SlotRow = { id: string; name: string; role: string; order: number };

/** The version a given slot is currently *behaving as*: the published one
 * if there is one (that is what the public viewer loads — see
 * `api/detail-models/[projectId]/route.ts`), otherwise the newest draft, so
 * a slot that has never been published is still editable here. Mirrors the
 * editor's own `versions[0]` (version desc) tie-break. */
async function resolveLiveVersion(slotId: string) {
  const published = await prisma.detailModelVersion.findFirst({
    where: { slotId, publicationStatus: "published", deletedAt: null },
    include: { unitLinks: true },
  });
  if (published) return published;
  return prisma.detailModelVersion.findFirst({
    where: { slotId, deletedAt: null },
    orderBy: { version: "desc" },
    include: { unitLinks: true },
  });
}

/** `Unit_*` node names from a stored manifest. Reads `autoClassification`
 * (set at upload time by glbValidate.ts) but falls back to the name pattern
 * so a manifest written before that field existed still resolves. Names are
 * already `cleanGlbNodeName`d on the way in; re-cleaning is a no-op that
 * keeps this correct if that ever stops being true. */
function unitBlockNamesFrom(sceneManifest: unknown): string[] {
  const nodes = (sceneManifest as { name?: string; autoClassification?: string }[] | null) ?? [];
  const names = new Set<string>();
  for (const node of nodes) {
    const name = cleanGlbNodeName(node?.name ?? "");
    if (!name) continue;
    if (node?.autoClassification === "unit_block" || UNIT_NODE_PATTERN.test(name)) names.add(name);
  }
  return Array.from(names).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

/**
 * The slot whose blocks this project's units are bound to.
 *
 * A `role: "units"` slot wins outright — that is the dedicated inventory
 * layer and the one the publish gate holds to the stricter standard. Only
 * when no units-role slot has a version at all does this fall back to
 * whichever other slot actually carries unit blocks, which covers the older
 * projects whose `Unit_*` boxes are still embedded in the Building GLB.
 * Returns null when the project has no 3D unit blocks anywhere, which is a
 * normal state (a project with inventory but no Units layer yet), not an
 * error.
 */
export async function resolveUnitBlockTarget(projectId: string): Promise<UnitBlockTarget | null> {
  const slots: SlotRow[] = await prisma.detailModelSlot.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, role: true, order: true },
  });
  if (slots.length === 0) return null;

  const ordered = [...slots].sort((a, b) => Number(b.role === "units") - Number(a.role === "units"));

  let fallback: UnitBlockTarget | null = null;
  for (const slot of ordered) {
    const version = await resolveLiveVersion(slot.id);
    if (!version) continue;

    const blockNames = unitBlockNamesFrom(version.sceneManifest);
    if (blockNames.length === 0 && version.unitLinks.length === 0) continue;

    // Match a stored link to a manifest node through `glbNodeNameKey`, not
    // `===`: the manifest holds the spelling read straight out of the glTF
    // JSON chunk while a link authored in the Experience Editor holds the
    // GLTFLoader-sanitized one, and `Unit.001` vs `Unit001` is the same
    // node. Comparing exactly here would paint a correctly-linked unit as
    // unmapped and invite an admin to "fix" something that was never broken.
    const linkByKey = new Map(version.unitLinks.map((l) => [glbNodeNameKey(l.meshName), l]));
    const blocks: UnitBlock[] = blockNames.map((meshName) => ({
      meshName,
      unitId: linkByKey.get(glbNodeNameKey(meshName))?.unitId ?? null,
    }));

    const claimedKeys = new Set(blockNames.map((n) => glbNodeNameKey(n)));
    const orphanLinks = version.unitLinks
      .filter((l) => !claimedKeys.has(glbNodeNameKey(l.meshName)))
      .map((l) => ({ meshName: l.meshName, unitId: l.unitId }));

    const [compiledReleaseCount, newerDraft] = await Promise.all([
      prisma.viewerRelease.count({ where: { projectId, status: { not: "archived" } } }),
      prisma.detailModelVersion.findFirst({
        where: {
          slotId: slot.id,
          deletedAt: null,
          publicationStatus: "draft",
          version: { gt: version.version },
        },
        orderBy: { version: "desc" },
        select: { version: true },
      }),
    ]);

    const target: UnitBlockTarget = {
      slot: { id: slot.id, name: slot.name, role: slot.role },
      version: {
        id: version.id,
        version: version.version,
        publicationStatus: version.publicationStatus,
        fileName: version.fileName,
      },
      blocks,
      compiledReleaseCount,
      newerDraftVersion: newerDraft?.version ?? null,
      orphanLinks,
    };
    if (slot.role === "units") return target;
    fallback ??= target;
  }
  return fallback;
}

/** Resolves the stored spelling to write for a block the admin picked.
 * Accepts the manifest name, and also an already-stored `meshName` that
 * only differs by GLTFLoader sanitization — in that case the STORED
 * spelling is kept, because that is the one the runtime scene graph is
 * currently resolving against. Returns null for a name this version has no
 * node for, which the route turns into a 400 rather than persisting a
 * binding that can never resolve. */
export function resolveMeshNameToStore(target: UnitBlockTarget, requested: string): string | null {
  const key = glbNodeNameKey(requested);
  const orphan = target.orphanLinks.find((l) => glbNodeNameKey(l.meshName) === key);
  if (orphan) return orphan.meshName;
  const block = target.blocks.find((b) => glbNodeNameKey(b.meshName) === key);
  return block ? block.meshName : null;
}
