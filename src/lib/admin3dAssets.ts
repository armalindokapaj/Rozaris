import { prisma } from "@/lib/db";

/**
 * Shared resolution layer behind the Admin console's 3D Health →
 * "Project 3D files" panel and its three routes
 * (`/api/admin/3d-assets`, `.../download`, `.../bundle`).
 *
 * The point of this file existing at all is that all three routes must
 * agree on exactly two things, and getting either wrong is a real bug:
 *
 * 1. WHICH rows are downloadable. Both version tables carry their own
 *    soft-delete (`deletedAt`) and `MapModelVersion`'s asset columns are
 *    *nullable* — a map version can legitimately be published as pure
 *    placement with no GLB at all (see that column's own schema comment).
 *    "No file yet" is a normal state to render, not an error to throw.
 *
 * 2. WHICH URLs the server is willing to fetch. See
 *    `isAllowedAssetUrl()` below — this is the SSRF boundary, and it is
 *    not hypothetical: the live database already contains a
 *    `MapModelVersion` whose `publicAssetUrl` is
 *    `https://example.com/nonexistent-test-model.glb`, left over from
 *    testing. A proxy route that fetched whatever URL a row happened to
 *    hold would be an authenticated request-forgery gadget pointed at
 *    whatever an upload path (or a future bug) put in that column.
 */

/**
 * Vercel Blob's public store hostname shape. Every GLB in this app is
 * uploaded client-direct to Blob (`@vercel/blob/client`'s `upload()`
 * with `addRandomSuffix`), so every legitimate asset URL lives under a
 * `<storeId>.public.blob.vercel-storage.com` host.
 *
 * Deliberately an exact-suffix match on the parsed hostname rather than a
 * substring test on the raw string — `https://evil.com/?x=.public.blob.vercel-storage.com`
 * and `https://public.blob.vercel-storage.com.evil.com/` both contain the
 * suffix as text and neither is a Blob URL.
 */
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * The SSRF gate. Only https URLs on the Vercel Blob public store may be
 * fetched server-side on an admin's behalf. Anything else — a stale
 * `example.com` test row, an internal `169.254.169.254` metadata address,
 * a `file://` path — is refused before any network call happens.
 */
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

/** One downloadable (or explicitly not-downloadable) GLB version row, as
 *  the panel renders it. Deliberately carries NO blob URL — downloads go
 *  through the admin-gated proxy by id, so the panel never has to hand a
 *  raw store URL to the browser. */
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
  /** False when the row has no usable asset URL — a placement-only map
   *  version, or a URL that fails `isAllowedAssetUrl()`. */
  downloadable: boolean;
  /** True when `sourceAssetUrl` is a different (also allowed) file from
   *  `publicAssetUrl`, i.e. the optimized delivery copy diverged from the
   *  original upload and both are worth offering. */
  hasDistinctSource: boolean;
}

export interface AdminAssetGroup {
  /** `slot:<id>` for a detail-model slot, or the literal `map` group. */
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
  /** Counts/sizes over downloadable files only, so the UI never promises
   *  bytes it cannot actually deliver. */
  fileCount: number;
  totalBytes: number;
  /** Files whose row exists but has no fetchable asset (placement-only
   *  map versions, or a URL the SSRF gate rejects). Surfaced so the panel
   *  can say so out loud instead of silently showing fewer files. */
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

/**
 * Every non-soft-deleted project that holds at least one non-soft-deleted
 * 3D version row, with its detail-model slots (in the editor's own
 * order) and its map-model versions.
 *
 * Soft-deleted versions are excluded to match every existing version-list
 * route in the app — a discarded draft is invisible to the 3D editor, so
 * it stays invisible here too. Their Blob objects do still exist; the
 * Super Admin Recycle Bin remains the one place that deals with them.
 */
export async function getAdminAssetProjects(): Promise<AdminAssetProject[]> {
  const projects = await prisma.project.findMany({
    where: {
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

/** One resolved, fetchable asset — the output of `resolveAssetVersion()`. */
export interface ResolvedAsset {
  url: string;
  /** Meaningful download name, already sanitized. */
  downloadName: string;
  /** For the audit-log `entityLabel`. */
  label: string;
  entityType: "DetailModelVersion" | "MapModelVersion";
  fileSize: number | null;
  createdAt: Date;
}

export type ResolveFailure =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "no_asset" }
  | { ok: false; reason: "blocked_url" };

/**
 * Turns `(kind, versionId, variant)` into a fetchable Blob URL plus a
 * human-meaningful filename — or an explicit typed failure. The caller
 * never supplies a URL; it is always read from the row, then re-checked
 * against `isAllowedAssetUrl()` even though it came from our own DB.
 */
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
  // `source` is an explicit request for the ORIGINAL upload, so it is
  // resolved strictly: if that column is empty or points somewhere we
  // refuse to fetch, say so rather than quietly handing back the delivery
  // copy under a filename that claims to be the source. The default
  // variant means "just give me this version's file" and may fall back to
  // the other column, since for most rows they are the same object.
  //
  // A version with no GLB at all is a documented, legitimate state for a
  // map model, so it is reported distinctly from "we refuse to fetch that
  // URL" — the route answers 404 vs 422 on the difference.
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

/**
 * `tower-vlora__building__v3__Tower-Facade.glb` — project, then which
 * slot it came from, then the version, then the admin's own original
 * upload name. Blob's stored object name is an unreadable
 * `custom-1787151323713-cmt246e1x…-KySmfIwK1H.glb`, and Blob already
 * serves it with a `Content-Disposition` carrying exactly that string, so
 * a meaningful name is the main practical thing the proxy adds over
 * linking straight at the store.
 */
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

/** Collapses anything that is not a plain filename character. Keeps the
 *  result ASCII so it is safe both as a ZIP entry name and as the ASCII
 *  fallback in a `Content-Disposition` header. */
function safeSegment(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
}

/**
 * RFC 6266 / RFC 5987 attachment header: a quoted ASCII fallback for old
 * agents plus a percent-encoded UTF-8 `filename*` for everything modern.
 * `buildDownloadName()` already yields ASCII, but this stays correct for
 * any caller-built name and — more importantly — strips CR/LF so a stray
 * newline in a DB-stored file name can never inject a second header.
 */
export function attachmentHeader(downloadName: string): string {
  const ascii = downloadName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
}

/** One file destined for a project's `.zip`, already name-sanitized. */
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
  /** Rows deliberately left out, with the reason — written into the
   *  archive's own MANIFEST.txt so an admin can see that a file is
   *  missing on purpose rather than quietly getting a short archive. */
  skipped: { label: string; reason: string }[];
  /** Sum of the DB's recorded `fileSize`s. Used only to refuse an
   *  unreasonably large archive up front; the real bytes come off the
   *  network and are never trusted to match. */
  declaredBytes: number;
}

/**
 * Gathers one project's GLBs for the bundle route.
 *
 * `scope: "current"` (the panel's default) takes the published version of
 * each slot, falling back to the highest version number when a slot has
 * never been published — i.e. "the files this project actually is right
 * now". `scope: "all"` takes every non-soft-deleted version, for an
 * admin who wants the full history.
 */
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
      // Prefer the original upload when it is a genuinely different file
      // from the optimized delivery copy — an admin downloading "the
      // project's 3D models" wants what was uploaded, not the derivative.
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

/**
 * The published version if there is one, else the highest version number
 * — matching how the 3D editor itself decides what is "live".
 *
 * With one correction that matters: a map model may be *published as pure
 * placement*, with the actual GLB living on an earlier version. Picking
 * the published row blindly would then produce a "current" bundle that
 * silently contains no map model at all even though the project has one.
 * So a published row with no usable file yields to the newest row that
 * has one. `rows` arrives ordered version-descending, so the first match
 * is the newest.
 */
function pickCurrent(rows: RawVersion[]): RawVersion[] {
  if (rows.length === 0) return [];
  const usable = (r: RawVersion) =>
    isAllowedAssetUrl(r.sourceAssetUrl) || isAllowedAssetUrl(r.publicAssetUrl);
  const published = rows.find((r) => r.publicationStatus === "published");
  if (published && usable(published)) return [published];
  const newestUsable = rows.find(usable);
  if (newestUsable) return [newestUsable];
  // Nothing in this group has a file — return the published/newest row so
  // the caller records an honest "skipped, no model file" line for it.
  return [published ?? rows[0]];
}
