"use client";

import { Fragment } from "react";
import Link from "next/link";
import { X, SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import {
  buildCompareRows,
  compareHref,
  compareImage,
  comparePrice,
  compareTitle,
} from "@/lib/compare";
import { formatPrice } from "@/lib/utils";

export function CompareOverlay() {
  const open = useAppStore((s) => s.compareOverlayOpen);
  const setOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const compare = useAppStore((s) => s.compare);
  const removeCompareAt = useAppStore((s) => s.removeCompareAt);

  if (!open) return null;

  const hasTwo = compare.length === 2;
  const rows = hasTwo ? buildCompareRows([compare[0], compare[1]]) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal>
      <button
        aria-label="Close comparison"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-white/60 backdrop-blur-md"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-panel bg-white shadow-2xl lg:max-h-[85vh] lg:rounded-panel">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
            <SquareStack className="h-4.5 w-4.5 text-brand-500" />
            Compare properties
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!hasTwo ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <SquareStack className="h-8 w-8 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-700">
              Add one more property to compare
            </p>
            <p className="max-w-xs text-sm text-neutral-500">
              Select up to two listings or units using the compare icon on any card.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto scroll-thin">
            <div className="grid grid-cols-[140px_1fr_1fr] lg:grid-cols-[180px_1fr_1fr]">
              <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white p-3" />
              {compare.map((item, i) => (
                <div
                  key={i}
                  className="sticky top-0 z-10 border-b border-l border-neutral-100 bg-white p-3"
                >
                  <div className="relative">
                    <PlaceholderImage
                      seed={compareImage(item)}
                      kind="interior"
                      className="aspect-[4/3] w-full rounded-card"
                    />
                    <button
                      onClick={() => removeCompareAt(i)}
                      aria-label="Remove from compare"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Link
                    href={compareHref(item)}
                    className="mt-2 block truncate text-sm font-semibold text-neutral-900 hover:text-brand-600"
                  >
                    {compareTitle(item)}
                  </Link>
                  <p className="text-sm font-bold text-brand-600">
                    {formatPrice(comparePrice(item).price, comparePrice(item).currency)}
                  </p>
                </div>
              ))}

              {rows.map((row) => (
                <Fragment key={row.label}>
                  <div className="border-b border-neutral-100 p-3 text-xs font-medium text-neutral-500">
                    {row.label}
                  </div>
                  <div className="border-b border-l border-neutral-100 p-3 text-sm text-neutral-800">
                    {row.values[0]}
                  </div>
                  <div className="border-b border-l border-neutral-100 p-3 text-sm text-neutral-800">
                    {row.values[1]}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
