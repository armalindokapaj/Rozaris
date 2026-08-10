"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export type SheetSnap = "collapsed" | "preview" | "half" | "expanded";

const SNAP_VH: Record<SheetSnap, number> = {
  collapsed: 0.16,
  // Just tall enough for the listings sheet's category-quick-filters row
  // and popular-areas row — the default state, with results cropped out
  // until the visitor drags the sheet up further.
  preview: 0.28,
  half: 0.6,
  expanded: 0.92,
};

export function BottomSheet({
  open,
  onClose,
  snap,
  onSnapChange,
  title,
  children,
  snapPoints = ["collapsed", "half", "expanded"],
  headerContent,
  tapToExpand,
}: {
  open: boolean;
  onClose: () => void;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  title?: string;
  children: ReactNode;
  snapPoints?: SheetSnap[];
  headerContent?: ReactNode;
  /** Snap tapped (not dragged) into when the visitor taps the sheet's
   * handle bar — e.g. "half" so it jumps to 60% of the screen. */
  tapToExpand?: SheetSnap;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { t } = useT();

  const heightVh = useMemo(() => SNAP_VH[snap] * 100, [snap]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      setDragOffset(e.clientY - dragStartY.current);
    },
    [isDragging]
  );

  const onPointerUp = useCallback(() => {
    if (!isDragging) return;
    const delta = dragOffset;
    setIsDragging(false);
    setDragOffset(0);

    const vh = window.innerHeight;
    const currentPx = (SNAP_VH[snap] * vh) - delta;
    const currentFraction = currentPx / vh;

    let nearest: SheetSnap = snapPoints[0];
    let nearestDist = Infinity;
    for (const point of snapPoints) {
      const dist = Math.abs(SNAP_VH[point] - currentFraction);
      if (dist < nearestDist) {
        nearest = point;
        nearestDist = dist;
      }
    }

    // Dragged down past the smallest snap point closes the sheet.
    if (currentFraction < SNAP_VH[snapPoints[0]] * 0.55) {
      onClose();
      return;
    }
    onSnapChange(nearest);
  }, [isDragging, dragOffset, onClose, onSnapChange, snap, snapPoints]);

  // A tap (click/touch, not a drag) anywhere in the sheet expands it to a
  // fixed snap — e.g. "half" so the listings sheet jumps to 60% of the
  // screen. Browsers already suppress the click event after a genuine
  // touch-drag, so this only fires for real taps.
  const onSheetClick = useCallback(() => {
    if (!tapToExpand || SNAP_VH[snap] >= SNAP_VH[tapToExpand]) return;
    onSnapChange(tapToExpand);
  }, [tapToExpand, snap, onSnapChange]);

  useEffect(() => {
    if (open) document.body.style.overscrollBehaviorY = "none";
    return () => {
      document.body.style.overscrollBehaviorY = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 lg:hidden"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      {snap === "expanded" && (
        <button
          aria-label={t("common.close")}
          onClick={onClose}
          className="pointer-events-auto absolute inset-0 bg-[rgba(15,15,20,0.28)]"
        />
      )}
      <div
        ref={sheetRef}
        onClick={onSheetClick}
        className={cn(
          "glass-panel pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-panel shadow-[0_-8px_30px_rgba(23,22,38,0.18)]",
          isDragging ? "" : "transition-[height] duration-300 ease-out"
        )}
        style={{
          height: `calc(${heightVh}vh - ${dragOffset}px)`,
          maxHeight: "94vh",
        }}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex shrink-0 cursor-grab flex-col items-center gap-2 pb-1 pt-2.5 active:cursor-grabbing"
        >
          <span className="h-1.5 w-10 rounded-full bg-neutral-300" />
          {(title || headerContent) && (
            <div className="flex w-full items-center justify-between px-4 pt-1">
              {title && <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>}
              <div className="flex items-center gap-2">
                {headerContent}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  aria-label={t("common.close")}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
