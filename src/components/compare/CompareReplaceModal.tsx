"use client";

import { useAppStore } from "@/lib/store";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { compareImage, compareTitle } from "@/lib/compare";

export function CompareReplaceModal() {
  const candidate = useAppStore((s) => s.compareReplaceCandidate);
  const compare = useAppStore((s) => s.compare);
  const confirmReplace = useAppStore((s) => s.confirmReplace);
  const cancelReplace = useAppStore((s) => s.cancelReplace);

  if (!candidate) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal>
      <button
        aria-label="Cancel"
        onClick={cancelReplace}
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm rounded-panel bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold text-neutral-900">Compare up to 2 properties</h2>
        <p className="mt-1.5 text-sm text-neutral-500">
          Choose which one to replace with <strong>{compareTitle(candidate)}</strong>.
        </p>
        <div className="mt-4 space-y-2">
          {compare.map((item, i) => (
            <button
              key={i}
              onClick={() => confirmReplace(i)}
              className="flex w-full items-center gap-3 rounded-card border border-neutral-200 p-2.5 text-left hover:border-brand-400 hover:bg-brand-50"
            >
              <PlaceholderImage
                seed={compareImage(item)}
                kind="interior"
                className="h-12 w-12 shrink-0 rounded-xl"
                iconClassName="h-4 w-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-800">
                  {compareTitle(item)}
                </span>
                <span className="text-xs text-brand-600">Replace this</span>
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={cancelReplace}
          className="mt-4 w-full rounded-control border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
