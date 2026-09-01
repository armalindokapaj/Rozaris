import type { AdminAssetFile } from "@/lib/admin3dAssets";

export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : null;
}

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
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function pickCurrentFile(files: AdminAssetFile[]): AdminAssetFile | undefined {
  const published = files.find((f) => f.publicationStatus === "published");
  if (published?.downloadable === true) return published;
  return files.find((f) => f.downloadable) ?? published ?? files[0];
}
