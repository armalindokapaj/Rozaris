import { prisma } from "@/lib/db";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function isAllowedAssetUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname.endsWith(BLOB_HOST_SUFFIX);
}

export type AssetKind = "detail" | "map";
export type AssetVariant = "public" | "source";

export interface AdminAssetFile {
  kind: AssetKind;
  versionId: string;
  version: number;
  fileName: string | null;
  fileSize: number | null;
  publicationStatus: "draft" | "published" | "archived";
  validationStatus: "ready" | "warning" | "blocked";
  createdAt: string;
  triangleCount: number | null;
  downloadable: boolean;
  hasDistinctSource: boolean;
}

export interface AdminAssetGroup {
  groupId: string;
  groupName: string;
  groupRole: "building" | "units" | "surroundings" | "context" | "custom" | "map";
  files: AdminAssetFile[];
}

export interface AdminAssetProject {
  projectId: string;
  projectSlug: string;
  projectName: string;
  groups: AdminAssetGroup[];
  fileCount: number;
  totalBytes: number;
  unavailableCount: number;
}

const VERSION_SELECT = {
  id: true,
  version: true,
  fileName: true,
  fileSize: true,
  publicationStatus: true,
  validationStatus: true,
  createdAt: true,
  triangleCount: true,
  publicAssetUrl: true,
  sourceAssetUrl: true,
} as const;

type RawVersion = {
  id: string;
  version: number;
  fileName: string | null;
  fileSize: number | null;
  publicationStatus: "draft" | "published" | "archived";
  validationStatus: "ready" | "warning" | "blocked";
  createdAt: Date;
  triangleCount: number | null;
  publicAssetUrl: string | null;
  sourceAssetUrl: string | null;
};

function toAssetFile(row: RawVersion, kind: AssetKind): AdminAssetFile {
  const publicOk = isAllowedAssetUrl(row.publicAssetUrl);
  const sourceOk = isAllowedAssetUrl(row.sourceAssetUrl);
  return {
    kind,
    versionId: row.id,
    version: row.version,
    fileName: row.fileName,
    fileSize: row.fileSize,
    publicationStatus: row.publicationStatus,
    validationStatus: row.validationStatus,
    createdAt: row.createdAt.toISOString(),
    triangleCount: row.triangleCount,
    downloadable: publicOk || sourceOk,
    hasDistinctSource: sourceOk && row.sourceAssetUrl !== row.publicAssetUrl,
  };
}

export async function getAdminAssetProjects(projectId?: string): Promise<AdminAssetProject[]> {
  const projects = await prisma.project.findMany({
    where: {
      ...(projectId ? { id: projectId } : {}),
      deletedAt: null,
      OR: [
        { detailModelSlots: { some: { versions: { some: { deletedAt: null } } } } },
        { mapModelVersions: { some: { deletedAt: null } } },
      ],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      detailModelSlots: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          role: true,
          versions: {
            where: { deletedAt: null },
            orderBy: { version: "desc" },
            select: VERSION_SELECT,
          },
        },
      },
      mapModelVersions: {
        where: { deletedAt: null },
        orderBy: { version: "desc" },
        select: VERSION_SELECT,
      },
    },
  });

  return projects.map((project) => {
    const groups: AdminAssetGroup[] = [];

    for (const slot of project.detailModelSlots) {
      if (slot.versions.length === 0) continue;
      groups.push({
        groupId: `slot:${slot.id}`,
        groupName: slot.name,
        groupRole: slot.role,
        files: slot.versions.map((v) => toAssetFile(v, "detail")),
      });
    }

    if (project.mapModelVersions.length > 0) {
      groups.push({
        groupId: "map",
        groupName: "Map model",
        groupRole: "map",
        files: project.mapModelVersions.map((v) => toAssetFile(v, "map")),
      });
    }

    const allFiles = groups.flatMap((g) => g.files);
    const downloadable = allFiles.filter((f) => f.downloadable);

    return {
      projectId: project.id,
      projectSlug: project.slug,
      projectName: project.name,
      groups,
      fileCount: downloadable.length,
      totalBytes: downloadable.reduce((sum, f) => sum + (f.fileSize ?? 0), 0),
      unavailableCount: allFiles.length - downloadable.length,
    };
  });
}

export interface ResolvedAsset {
  url: string;
  downloadName: string;
  label: string;
  entityType: "DetailModelVersion" | "MapModelVersion";
  fileSize: number | null;
  createdAt: Date;
}

export type ResolveFailure =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "no_asset" }
  | { ok: false; reason: "blocked_url" };

export async function resolveAssetVersion(
  kind: AssetKind,
  versionId: string,
  variant: AssetVariant
): Promise<{ ok: true; asset: ResolvedAsset } | ResolveFailure> {
  if (kind === "detail") {
    const row = await prisma.detailModelVersion.findFirst({
      where: { id: versionId, deletedAt: null },
      select: {
        ...VERSION_SELECT,
        slot: { select: { name: true } },
        project: { select: { name: true, slug: true, deletedAt: true } },
      },
    });
    if (!row || row.project.deletedAt) return { ok: false, reason: "not_found" };
    return finishResolve({
      variant,
      publicAssetUrl: row.publicAssetUrl,
      sourceAssetUrl: row.sourceAssetUrl,
      projectSlug: row.project.slug,
      groupName: row.slot.name,
      version: row.version,
      fileName: row.fileName,
      fileSize: row.fileSize,
      createdAt: row.createdAt,
      label: `${row.project.name} · ${row.slot.name} v${row.version}`,
      entityType: "DetailModelVersion",
    });
  }

  const row = await prisma.mapModelVersion.findFirst({
    where: { id: versionId, deletedAt: null },
    select: {
      ...VERSION_SELECT,
      project: { select: { name: true, slug: true, deletedAt: true } },
    },
  });
  if (!row || row.project.deletedAt) return { ok: false, reason: "not_found" };
  return finishResolve({
    variant,
    publicAssetUrl: row.publicAssetUrl,
    sourceAssetUrl: row.sourceAssetUrl,
    projectSlug: row.project.slug,
    groupName: "map-model",
    version: row.version,
    fileName: row.fileName,
    fileSize: row.fileSize,
    createdAt: row.createdAt,
    label: `${row.project.name} · map model v${row.version}`,
    entityType: "MapModelVersion",
  });
}

function finishResolve(input: {
  variant: AssetVariant;
  publicAssetUrl: string | null;
  sourceAssetUrl: string | null;
  projectSlug: string;
  groupName: string;
  version: number;
  fileName: string | null;
  fileSize: number | null;
  createdAt: Date;
  label: string;
  entityType: "DetailModelVersion" | "MapModelVersion";
}): { ok: true; asset: ResolvedAsset } | ResolveFailure {
  let url: string | null;
  if (input.variant === "source") {
    if (!input.sourceAssetUrl) return { ok: false, reason: "no_asset" };
    if (!isAllowedAssetUrl(input.sourceAssetUrl)) return { ok: false, reason: "blocked_url" };
    url = input.sourceAssetUrl;
  } else {
    if (!input.publicAssetUrl && !input.sourceAssetUrl) return { ok: false, reason: "no_asset" };
    url = isAllowedAssetUrl(input.publicAssetUrl)
      ? input.publicAssetUrl
      : isAllowedAssetUrl(input.sourceAssetUrl)
        ? input.sourceAssetUrl
        : null;
    if (!url) return { ok: false, reason: "blocked_url" };
  }

  return {
    ok: true,
    asset: {
      url,
      downloadName: buildDownloadName({
        projectSlug: input.projectSlug,
        groupName: input.groupName,
        version: input.version,
        variant: input.variant,
        fileName: input.fileName,
      }),
      label: input.label,
      entityType: input.entityType,
      fileSize: input.fileSize,
      createdAt: input.createdAt,
    },
  };
}

export function buildDownloadName(input: {
  projectSlug: string;
  groupName: string;
  version: number;
  variant: AssetVariant;
  fileName: string | null;
}): string {
  const original = safeSegment(stripExtension(input.fileName ?? "model"));
  const parts = [
    safeSegment(input.projectSlug),
    safeSegment(input.groupName),
    `v${input.version}`,
    ...(input.variant === "source" ? ["source"] : []),
    original,
  ].filter(Boolean);
  return `${parts.join("__").slice(0, 180)}.glb`;
}

function stripExtension(name: string) {
  return name.replace(/\.(glb|gltf)$/i, "");
}

function safeSegment(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
}

export function attachmentHeader(downloadName: string): string {
  const ascii = downloadName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
}

export interface BundleEntry {
  url: string;
  name: string;
  lastModified: Date;
  fileSize: number | null;
}

export interface ProjectBundle {
  projectSlug: string;
  projectName: string;
  entries: BundleEntry[];
  skipped: { label: string; reason: string }[];
  declaredBytes: number;
}

export async function collectProjectBundle(
  projectId: string,
  scope: "current" | "all"
): Promise<ProjectBundle | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      slug: true,
      name: true,
      detailModelSlots: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          name: true,
          versions: {
            where: { deletedAt: null },
            orderBy: { version: "desc" },
            select: VERSION_SELECT,
          },
        },
      },
      mapModelVersions: {
        where: { deletedAt: null },
        orderBy: { version: "desc" },
        select: VERSION_SELECT,
      },
    },
  });
  if (!project) return null;

  const entries: BundleEntry[] = [];
  const skipped: { label: string; reason: string }[] = [];

  const addGroup = (groupName: string, rows: RawVersion[]) => {
    const chosen = scope === "all" ? rows : pickCurrent(rows);
    for (const row of chosen) {
      const label = `${groupName} v${row.version}`;
      const preferred = isAllowedAssetUrl(row.sourceAssetUrl) ? row.sourceAssetUrl : row.publicAssetUrl;
      if (!row.publicAssetUrl && !row.sourceAssetUrl) {
        skipped.push({ label, reason: "no model file (placement only)" });
        continue;
      }
      if (!isAllowedAssetUrl(preferred)) {
        skipped.push({ label, reason: "asset URL is not on the Blob store" });
        continue;
      }
      entries.push({
        url: preferred,
        name: buildDownloadName({
          projectSlug: project.slug,
          groupName,
          version: row.version,
          variant: "public",
          fileName: row.fileName,
        }),
        lastModified: row.createdAt,
        fileSize: row.fileSize,
      });
    }
  };

  for (const slot of project.detailModelSlots) addGroup(slot.name, slot.versions);
  addGroup("map-model", project.mapModelVersions);

  return {
    projectSlug: project.slug,
    projectName: project.name,
    entries,
    skipped,
    declaredBytes: entries.reduce((sum, e) => sum + (e.fileSize ?? 0), 0),
  };
}

function pickCurrent(rows: RawVersion[]): RawVersion[] {
  if (rows.length === 0) return [];
  const usable = (r: RawVersion) =>
    isAllowedAssetUrl(r.sourceAssetUrl) || isAllowedAssetUrl(r.publicAssetUrl);
  const published = rows.find((r) => r.publicationStatus === "published");
  if (published && usable(published)) return [published];
  const newestUsable = rows.find(usable);
  if (newestUsable) return [newestUsable];
  return [published ?? rows[0]];
}
