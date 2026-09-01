import { prisma } from "@/lib/db";
import { cleanGlbNodeName, glbNodeNameKey } from "@/lib/glbNodeName";

const UNIT_NODE_PATTERN = /^Unit_/i;

export interface UnitBlock {
  meshName: string;
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
  compiledReleaseCount: number;
  newerDraftVersion: number | null;
  orphanLinks: { meshName: string; unitId: string }[];
}

type SlotRow = { id: string; name: string; role: string; order: number };

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

export function resolveMeshNameToStore(target: UnitBlockTarget, requested: string): string | null {
  const key = glbNodeNameKey(requested);
  const orphan = target.orphanLinks.find((l) => glbNodeNameKey(l.meshName) === key);
  if (orphan) return orphan.meshName;
  const block = target.blocks.find((b) => glbNodeNameKey(b.meshName) === key);
  return block ? block.meshName : null;
}
