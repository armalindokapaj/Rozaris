import type { AdminAssetFile } from "@/lib/admin3dAssets";

/**
 * The client half of the admin 3D-asset download feature.
 *
 * `src/lib/admin3dAssets.ts` imports prisma at module scope, so it is
 * server-only and a client component may only `import type` from it.
 * Everything a browser needs to *consume* those routes therefore lives
 * here instead — shared by the Admin Dashboard's 3D Health panel
 * (`Admin3DFilesPanel`) and the Project Manager's 3D Assets section, which
 * read the same inventory payload and hit the same download routes.
 *
 * Two consumers of one payload is exactly where a quietly-diverging second
 * copy of `pickCurrentFile()` would produce two different answers to "what
 * is this slot's current model", so it is defined once, here.
 */

/** Reads `filename*=UTF-8''…` (preferred) or the quoted ASCII fallback
 *  out of a `Content-Disposition` header. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      // fall through to the ASCII form
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : null;
}

/**
 * Pulls one file (or a bundle) through `fetch`, then hands the browser a
 * one-shot object URL. The server's own `Content-Disposition` is the
 * source of truth for the name — `fallbackName` only covers a proxy
 * stripping it.
 *
 * Deliberately not a bare `<a href>`: the download routes answer 404 /
 * 422 / 429 / 502 with a JSON body, and a plain link navigates the admin
 * out of the console and into that raw body. Throwing instead lets each
 * caller keep its own inline failure line.
 */
export async function downloadAdminAsset(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filenameFromDisposition(res.headers.get("content-disposition")) ?? fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick — revoking synchronously can race the
  // browser actually reading the blob in some engines.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

/**
 * The client-side mirror of the server's `pickCurrent()`: the published
 * version if there is one, else the newest.
 *
 * With the same correction that function carries: a map model may be
 * *published as pure placement*, with the actual GLB living on an earlier
 * version. A published-but-fileless row therefore yields to the newest row
 * that has a file — otherwise the default view says "no model file" while
 * the real model sits hidden behind the version-history toggle.
 *
 * `files` arrives version-descending from the inventory route, so the
 * first match is the newest.
 */
export function pickCurrentFile(files: AdminAssetFile[]): AdminAssetFile | undefined {
  const published = files.find((f) => f.publicationStatus === "published");
  if (published?.downloadable === true) return published;
  return files.find((f) => f.downloadable) ?? published ?? files[0];
}
