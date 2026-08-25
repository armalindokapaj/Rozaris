"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { dockMagnification } from "@/lib/dockMagnification";
import type { FloorRailBuilding, FloorRailEntry } from "@/lib/floorRail";

/** Base slot height in px — the untouched, un-magnified height of one
 * floor row. Desktop and touch differ: 44px is the minimum comfortable tap
 * target, while on a pointer device a tighter stack lets more of a tall
 * building's floors sit on screen at once. */
const SLOT_DESKTOP = 40;
const SLOT_TOUCH = 44;

/**
 * Magnification ceiling — the scale the number directly under the pointer
 * reaches. Bounded by the rail's own box on both axes: 15px × 1.95 ≈ 29px
 * is short enough not to touch the row above inside a 40px slot, and a
 * two-digit floor at that scale is ~35px wide, which still clears the
 * 40px-wide pill it is centred in (see the doc comment on why the pill
 * itself must not scale).
 */
const MAX_SCALE = 1.95;
/** Per-frame approach factor for the scale lerp — a cheap damped follow,
 * so the bulge eases in and out instead of snapping to wherever the
 * pointer jumped to. */
const LERP = 0.28;
/** How close (in slots) the pointer has to be to a row's centre for that
 * row to count as the one being pointed at, for the label chip. */
const HOVER_SLOTS = 0.5;

/**
 * The Project Viewer's floor rail — a vertical stack of floor numbers down
 * the left edge of the 3D viewport, top floor at the top and ground floor
 * at the bottom, that cuts the building open at the floor you click
 * (2026-08-25 direct instruction: "vertically, all the floors, ground
 * floor is to the bottom, top floor is at the top... on hover the floor
 * number gets bigger like the mac dock ui/ux. clicking the floor number
 * immediately shows the floor in floor section").
 *
 * ## The dock magnification
 *
 * Every box in the rail is a FIXED size — slot, row, button and pill — and
 * the only thing that scales is the glyph inside. A real macOS dock also
 * displaces its neighbours (each icon's box grows, so the stack lengthens
 * around the cursor), and that is the wrong trade for a rail you are meant
 * to click precisely: displacing neighbours moves rows out from under the
 * pointer, which both fights the browser's own hit testing (a transformed
 * element has a transformed hit area, so the row the cursor is over stops
 * being the row the magnification math thinks it is over, and the two
 * chase each other frame to frame) and slides a small target away
 * mid-click. Scaling only the glyph keeps hit testing exactly honest — the
 * row you point at is the row that grows — and the visual read is the same
 * bulge, because what a visitor sees growing is the number.
 *
 * It also has to be the glyph rather than the row for a plainer reason,
 * found in a real browser: the rail scrolls (see below), and `overflow-y`
 * forces the cross axis to clip too, so anything that grew past the rail's
 * own width — a scaled row box, its pill, a label — came out sliced down
 * the middle. A glyph magnified inside its pill never reaches that edge.
 *
 * Scales are written straight to the DOM from a rAF loop rather than held
 * in React state: this runs on every pointer move over a 3D viewport that
 * is already spending its frame budget on the scene, and re-rendering a
 * dozen rows per mouse move to change a transform would be pure waste.
 * Each frame reads every row's geometry first and writes transforms only
 * afterwards, so the reads can't be forced to re-layout between rows.
 *
 * ## Touch
 *
 * There is no hover on a phone, so the same bulge follows the finger while
 * it is down (pointerdown → pointermove → pointerup), which gives a press
 * the same "this is the row you are on" feedback a hover gives. Selection
 * itself stays an ordinary click, i.e. an ordinary tap — deliberately not
 * drag-to-scrub, which cannot be made reliable when a lifted finger that
 * has moved off its original target fires no click at all.
 *
 * ## Disabled floors
 *
 * A floor with inventory but no section authored for it renders as a real
 * but non-interactive row (2026-08-25 decision: "list all floors, disable
 * the rest"). Deliberately not hidden: the rail's job is to describe the
 * building's occupied floors, and one that silently omitted floor 6 would
 * read as "there is nothing on floor 6" rather than "nobody has drawn
 * floor 6's cut yet".
 */
export function FloorRail({
  buildings,
  activeSectionId,
  selectedFloorId,
  onSelectFloor,
  isTouch,
  className,
}: {
  buildings: FloorRailBuilding[];
  /** The section currently clipping the scene, whichever control applied
   * it — the rail lights up the floor that owns it, so the rail and the
   * unit card's own "View in Floor" button can never disagree about what
   * is cut. */
  activeSectionId: string | null;
  /** The floor the currently selected unit stands on (`buildingName::floor`),
   * marked as a secondary state so a visitor who picked a unit can see
   * where it sits in the stack without that reading as a cut. */
  selectedFloorId: string | null;
  onSelectFloor: (entry: FloorRailEntry) => void;
  isTouch: boolean;
  className?: string;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const slot = isTouch ? SLOT_TOUCH : SLOT_DESKTOP;

  // Which building's floors the rail is showing. Held by index rather than
  // by name so a renamed building can't strand this on a name that no
  // longer exists, and clamped on read rather than corrected by an effect
  // (a project whose building list shrank would otherwise render one frame
  // of nothing before the effect could fix the index).
  const [pickedBuildingIndex, setPickedBuildingIndex] = useState(0);
  const [buildingMenuOpen, setBuildingMenuOpen] = useState(false);
  const buildingIndex = pickedBuildingIndex < buildings.length ? pickedBuildingIndex : 0;
  const building = buildings[buildingIndex];
  const floors = useMemo(() => building?.floors ?? [], [building]);

  /** The whole rail, heading included — the box the label chip is
   * positioned inside, so chip offsets have to be measured against THIS
   * and not against the scrolling list, which now starts a heading's
   * height further down. */
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  /** Pointer position in CLIENT coordinates, or null for "nothing is
   * pointing at this rail" (the resting state, every scale → 1). Client
   * coordinates, not container-local, because the rail scrolls: comparing
   * two live `getBoundingClientRect()` reads is correct at any scroll
   * offset without a single manual `scrollTop` correction. */
  const pointerClientYRef = useRef<number | null>(null);
  const scalesRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  /** The loop re-arms itself through this rather than by naming `tick`
   * inside its own body — a `useCallback` cannot reference itself before
   * it is declared, and a stale captured copy would keep animating with
   * last render's slot size after a breakpoint change. */
  const tickRef = useRef<(() => void) | null>(null);
  /** Row index under the pointer + where to draw its label chip, in px
   * from the rail's top edge. Real content rather than a transform, so
   * unlike the scales this does belong in React state — it changes once
   * per row crossed, not once per frame. */
  const [hovered, setHovered] = useState<{ index: number; top: number } | null>(null);

  useEffect(() => {
    rowRefs.current.length = floors.length;
    scalesRef.current.length = floors.length;
  }, [floors.length]);

  // One rAF loop, started on demand and stopped as soon as every row has
  // settled back to rest — an idle rail costs nothing.
  const tick = useCallback(() => {
    rafRef.current = null;
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;
    const railTop = wrapper.getBoundingClientRect().top;
    const pointerClientY = pointerClientYRef.current;

    // Pass 1 — read every row's live geometry before anything is written.
    const centres = rowRefs.current.map((el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });

    // Pass 2 — compute, write, and pick the row being pointed at.
    let moving = false;
    let nearest: { index: number; top: number; distance: number } | null = null;
    for (let i = 0; i < centres.length; i += 1) {
      const centre = centres[i];
      const el = rowRefs.current[i];
      if (centre == null || !el) continue;
      const distanceSlots = pointerClientY == null ? Infinity : Math.abs(pointerClientY - centre) / slot;
      const target =
        pointerClientY == null || reducedMotion ? 1 : 1 + (MAX_SCALE - 1) * dockMagnification(distanceSlots);

      const current = scalesRef.current[i] ?? 1;
      const next = current + (target - current) * LERP;
      const settled = Math.abs(next - target) < 0.002;
      scalesRef.current[i] = settled ? target : next;
      if (!settled) moving = true;

      const scale = scalesRef.current[i];
      const glyph = el.querySelector<HTMLElement>("[data-glyph]");
      if (glyph) {
        // Scale only, around the glyph's own centre — no translation of any
        // kind (2026-08-25 direct instruction: "floor numbers stay static").
        // The rail used to nudge a magnified number a few px toward the
        // viewport, borrowing the dock's grow-away-from-the-edge move; the
        // numbers now hold their column exactly and only change size.
        glyph.style.transform = `scale(${scale.toFixed(3)})`;
      }

      if (distanceSlots < HOVER_SLOTS && (!nearest || distanceSlots < nearest.distance)) {
        nearest = { index: i, top: centre - railTop, distance: distanceSlots };
      }
    }

    setHovered((prev) => {
      if (!nearest) return prev == null ? prev : null;
      if (prev && prev.index === nearest.index && Math.abs(prev.top - nearest.top) < 0.5) return prev;
      return { index: nearest.index, top: nearest.top };
    });
    if (moving) rafRef.current = requestAnimationFrame(() => tickRef.current?.());
  }, [reducedMotion, slot]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const schedule = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const trackPointer = useCallback(
    (clientY: number) => {
      pointerClientYRef.current = clientY;
      schedule();
    },
    [schedule]
  );

  const releasePointer = useCallback(() => {
    pointerClientYRef.current = null;
    schedule();
  }, [schedule]);

  if (!building || floors.length === 0) return null;

  const hoveredEntry = hovered ? floors[hovered.index] : null;

  return (
    <div className={cn("pointer-events-none flex flex-col items-start gap-2", className)}>
      {buildings.length > 1 && (
        <div className="pointer-events-auto relative">
          <button
            type="button"
            onClick={() => setBuildingMenuOpen((open) => !open)}
            className="viewer-glass flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[11px] font-semibold text-white/85 transition-colors hover:text-white"
          >
            {building.name}
            <ChevronDown className={cn("h-3 w-3 transition-transform", buildingMenuOpen && "rotate-180")} />
          </button>
          {buildingMenuOpen && (
            <div className="viewer-glass absolute left-0 top-full z-10 mt-1 min-w-[9rem] overflow-hidden rounded-card py-1">
              {buildings.map((b, i) => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => {
                    setPickedBuildingIndex(i);
                    setBuildingMenuOpen(false);
                  }}
                  className={cn(
                    "block w-full px-3 py-1.5 text-left text-[11px] font-medium transition-colors",
                    i === buildingIndex
                      ? "bg-brand-500/15 text-brand-300"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Anchor for the label chip. The chip CANNOT live inside the scroll
          container below: `overflow-y: auto` forces the cross axis to clip
          too, so a chip sitting to the right of a row would be cut off (or
          worse, add a horizontal scrollbar over the scene). */}
      <div ref={wrapperRef} className="relative">
        {/* The panel itself no longer scrolls — the list inside it does.
            That split exists so the heading stays pinned while a tall
            building's floors scroll under it, instead of being the first
            thing to disappear. */}
        <div className="viewer-glass pointer-events-auto overflow-hidden rounded-panel">
          <div className="px-1.5 pb-1 pt-2 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-white/40">
            {t("unit.floorRailHeading")}
          </div>
          <div className="mx-1.5 border-t border-white/10" />
          <div
            ref={containerRef}
            role="group"
            aria-label={t("unit.floorRailLabel")}
            onPointerMove={(e) => {
            // Rows have no hover state on touch; the press-and-hold bulge
            // below replaces it, and letting a synthetic touch "move" also
            // drive the hover path would leave the bulge stuck on after the
            // finger lifts.
            if (e.pointerType === "touch") return;
              trackPointer(e.clientY);
            }}
            onPointerLeave={releasePointer}
            onPointerDown={(e) => {
              if (e.pointerType !== "touch") return;
              trackPointer(e.clientY);
            }}
            onPointerUp={releasePointer}
            onPointerCancel={releasePointer}
            // `scroll-none` + a viewport-relative cap: a 30-storey tower's
            // rail is taller than a laptop screen, and one that overflowed
            // off both ends would put its top floors permanently out of
            // reach. Scrolls, with no scrollbar drawn over the scene.
            className="scroll-none max-h-[min(66vh,40rem)] overflow-y-auto px-1.5 py-1.5"
          >
            {floors.map((entry, index) => {
              const disabled = entry.sectionId == null;
              const active = entry.sectionId != null && entry.sectionId === activeSectionId;
              const selected = entry.floorId === selectedFloorId;
              return (
                <div
                  key={entry.floorId}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  className="flex items-center"
                  style={{ height: slot }}
                >
                  {/* The button fills the whole slot — a 40px-tall target
                      rather than the pill's 32px — while the pill inside it
                      stays the visible chip. Safe precisely because neither
                      of them is what gets transformed. */}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelectFloor(entry)}
                    title={
                      disabled
                        ? t("unit.floorRailNoSection", { n: entry.floor })
                        : active
                          ? t("unit.exitFloorViewTitle", { n: entry.floor })
                          : t("unit.viewInFloorTitle", { n: entry.floor })
                    }
                    aria-label={t("unit.floorLabel", { n: entry.floor })}
                    aria-pressed={active}
                    className={cn(
                      "group flex h-full w-full items-center justify-center",
                      disabled ? "cursor-not-allowed" : "cursor-pointer"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-10 items-center justify-center rounded-control transition-colors duration-150",
                        disabled
                          ? "text-white/25"
                          : active
                            ? "bg-brand-500 text-white"
                            : selected
                              ? "text-brand-300 group-hover:bg-white/5 group-hover:text-brand-200"
                              : "text-white/70 group-hover:bg-white/5 group-hover:text-white"
                      )}
                    >
                      <span
                        data-glyph
                        className="text-[15px] font-semibold leading-none tabular-nums will-change-transform"
                      >
                        {entry.floor}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* The row's own identity, spelled out — a bare number is ambiguous
            the first time you meet the rail, and the unit count is what
            tells a visitor whether a floor is worth opening. Only the row
            under the pointer gets one, so the rail stays a thin strip the
            rest of the time. */}
        {hoveredEntry && hovered && (
          <span
            className="viewer-glass pointer-events-none absolute left-full ml-3 -translate-y-1/2 whitespace-nowrap rounded-pill px-2.5 py-1 text-[11px] font-medium text-white/90"
            style={{ top: hovered.top }}
          >
            {t("unit.floorLabel", { n: hoveredEntry.floor })}
            <span className="text-white/50">
              {" · "}
              {hoveredEntry.sectionId == null
                ? t("unit.floorRailNoSectionShort")
                : hoveredEntry.unitCount === 1
                  ? t("unit.floorRailUnitsOne")
                  : t("unit.floorRailUnits", { count: hoveredEntry.unitCount })}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
