"use client";

import { X, SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { compareImage, comparePrice, compareTitle } from "@/lib/compare";
import { formatPrice } from "@/lib/utils";

export function CompareTray() {
  const compare = useAppStore((s) => s.compare);
  const removeCompareAt = useAppStore((s) => s.removeCompareAt);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);

  if (compare.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(16vh+10px)] z-20 flex justify-center lg:bottom-0 lg:pb-4">
      <div className="glass-panel pointer-events-auto flex items-center gap-3 rounded-panel px-3 py-2.5 shadow-xl">
        <div className="flex items-center gap-2">
          {compare.map((item, i) => (
            <div key={i} className="relative">
              <PlaceholderImage
                seed={compareImage(item)}
                kind="interior"
                className="h-11 w-11 rounded-xl"
                iconClassName="h-4 w-4"
              />
              <button
                onClick={() => removeCompareAt(i)}
                aria-label={`Remove ${compareTitle(item)} from compare`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-white shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {compare.length < 2 && (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 text-neutral-400">
              <SquareStack className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="hidden text-xs text-neutral-500 sm:block">
          {compare.map((item, i) => (
            <p key={i} className="font-medium text-neutral-700">
              {formatPrice(comparePrice(item).price, comparePrice(item).currency, {
                compact: true,
              })}
            </p>
          ))}
        </div>
        <button
          onClick={() => setCompareOverlayOpen(true)}
          disabled={compare.length < 2}
          className="rounded-control bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Compare {compare.length}/2
        </button>
      </div>
    </div>
  );
}
