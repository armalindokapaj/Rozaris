"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2, Upload } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { Btn, EmptyState, ErrorNote, Field, Panel, SectionHeader, inputClass } from "./kit";
import type { ProjectDraft } from "./draft";

/** Keep in sync with `/api/blob/upload`'s own `projects/` branch. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Project Manager → "Media". Real uploads (Vercel Blob, straight from the
 * browser via `/api/blob/upload`'s `projects/` prefix) alongside the
 * paste-a-URL path the old modal offered — a URL field is fine for a
 * render already hosted somewhere, and useless for the photo sitting on an
 * admin's desktop, which was the actual complaint.
 *
 * Order is meaningful: `gallery[0]` is what the project card falls back to
 * and what the detail page leads with, so reordering is a real editing
 * action here rather than something only achievable by deleting and
 * re-adding in the right sequence.
 */
export function ProjectMediaSection({
  projectId,
  draft,
  onChange,
}: {
  projectId: string;
  draft: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
}) {
  const { t } = useT();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | null, target: "hero" | "gallery") {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (!ACCEPTED.includes(file.type)) {
          throw new Error(t("projectManager.mediaTypeRejected", { name: file.name }));
        }
        if (file.size > MAX_IMAGE_BYTES) {
          throw new Error(t("projectManager.mediaTooLarge", { name: file.name, mb: 20 }));
        }
        const blob = await upload(`projects/${projectId}/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        });
        urls.push(blob.url);
      }
      if (target === "hero") {
        onChange({ heroImage: urls[0] });
      } else {
        onChange({ gallery: [...draft.gallery, ...urls] });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.includes("authoriz") ? t("admin.sessionExpiredNote") : message || t("projectManager.mediaUploadFailed"));
    } finally {
      setUploading(false);
      if (heroInputRef.current) heroInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  function move(index: number, delta: number) {
    const next = [...draft.gallery];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ gallery: next });
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.mediaTitle")} description={t("projectManager.mediaDescription")} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Panel title={t("admin.heroImageLabel")} description={t("projectManager.heroDescription")}>
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="relative aspect-4/3 overflow-hidden rounded-card border border-neutral-200 bg-neutral-100">
            {draft.heroImage ? (
              // Blob/remote hosts aren't all in next.config's image
              // allowlist, and an admin can paste any URL here — a plain
              // <img> is the honest choice for arbitrary remote media.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.heroImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-neutral-400">
                {t("projectManager.noHeroImage")}
              </span>
            )}
          </div>
          <div className="space-y-3">
            <Field label={t("projectManager.imageUrlLabel")}>
              <input
                value={draft.heroImage}
                onChange={(e) => onChange({ heroImage: e.target.value })}
                placeholder="https://…"
                className={inputClass}
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              <Btn type="button" onClick={() => heroInputRef.current?.click()} disabled={uploading}>
                <Upload className="h-3.5 w-3.5" />
                {uploading ? t("projectManager.uploading") : t("projectManager.uploadImage")}
              </Btn>
              {draft.heroImage && (
                <Btn type="button" variant="danger" onClick={() => onChange({ heroImage: "" })}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("projectManager.removeHero")}
                </Btn>
              )}
            </div>
            <input
              ref={heroInputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              hidden
              onChange={(e) => void uploadFiles(e.target.files, "hero")}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title={t("projectManager.galleryTitle", { count: draft.gallery.length })}
        description={t("projectManager.galleryDescription")}
        actions={
          <>
            <Btn type="button" onClick={() => galleryInputRef.current?.click()} disabled={uploading}>
              <ImagePlus className="h-3.5 w-3.5" />
              {uploading ? t("projectManager.uploading") : t("projectManager.addImages")}
            </Btn>
            <input
              ref={galleryInputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              multiple
              hidden
              onChange={(e) => void uploadFiles(e.target.files, "gallery")}
            />
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("url") as HTMLInputElement;
            const url = input.value.trim();
            if (url && !draft.gallery.includes(url)) onChange({ gallery: [...draft.gallery, url] });
            input.value = "";
          }}
          className="mb-4 flex gap-1.5"
        >
          <input name="url" placeholder={t("projectManager.pasteImageUrl")} className={inputClass} />
          <Btn type="submit" className="shrink-0">
            {t("projectManager.add")}
          </Btn>
        </form>

        {draft.gallery.length === 0 ? (
          <EmptyState>{t("projectManager.galleryEmpty")}</EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {draft.gallery.map((url, index) => (
              <li key={`${url}-${index}`} className="overflow-hidden rounded-card border border-neutral-200">
                <div className="relative aspect-4/3 bg-neutral-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-white tabular-nums">
                    {index + 1}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-0.5 px-1 py-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title={t("projectManager.moveEarlier")}
                    className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === draft.gallery.length - 1}
                    title={t("projectManager.moveLater")}
                    className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ heroImage: url })}
                    title={t("projectManager.makeHero")}
                    className={`rounded-control p-1.5 hover:bg-neutral-100 ${
                      draft.heroImage === url ? "text-amber-500" : "text-neutral-500"
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" fill={draft.heroImage === url ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ gallery: draft.gallery.filter((_, i) => i !== index) })}
                    title={t("projectManager.removeImage")}
                    className="rounded-control p-1.5 text-neutral-500 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
