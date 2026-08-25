/**
 * The magnification curve behind the Project Viewer's floor rail
 * (`FloorRail.tsx`) — macOS-dock behaviour, expressed as one pure
 * function of "how far is this row from the pointer".
 *
 * Its own module, rather than a const inside the component, for one
 * reason: the guarantee it carries ("never more than five floors react")
 * is a property of the maths, and the only project on the platform with
 * real inventory has three floors, so nothing a browser can be pointed at
 * exercises it. `scripts/test-floor-rail-magnify.ts` does, exhaustively.
 */

/**
 * Radius of the magnification window, in slots (one slot = one floor
 * row's height). Everything further from the pointer than this is left at
 * exactly 1 — untouched, not merely nearly-untouched.
 *
 * 2.5 is not a taste value, it is the number that makes "affects max 5
 * floors" (2026-08-25 direct instruction) a property of the geometry
 * rather than something to hope for. Row centres sit exactly one slot
 * apart, so the open interval of width 2 × 2.5 = 5 slots centred on the
 * pointer can contain at most five of them: the row under the pointer,
 * two above, two below. At 3 a sixth floor starts moving; at 2 the pair
 * at the window's edge pops into motion discontinuously, because the
 * curve below is still well above zero where it would get cut off.
 */
export const DOCK_WINDOW_SLOTS = 2.5;

/**
 * How much of the available magnification a row `distanceSlots` from the
 * pointer receives: 1 for the row directly under it, 0 for anything
 * outside the window, smooth in between.
 *
 * A raised cosine, which is what gives a dock its shape — and, unlike the
 * Gaussian this was first written with, it reaches the edge of its window
 * at zero AND with zero slope, so a floor entering or leaving the group of
 * five does it without a visible step. The Gaussian had the right look in
 * the middle but no edge at all: it was still moving the sixth and seventh
 * floors by a percent or two, which is the "max 5 floors" rule being
 * broken quietly rather than obviously.
 *
 * Against the rail's own ×1.95 ceiling this lands at ×1.95 under the
 * pointer, ×1.62 for the floors either side, and ×1.09 for the pair beyond
 * those — biggest where the mouse is, slightly bigger next to it, flat
 * everywhere else.
 */
export function dockMagnification(distanceSlots: number): number {
  const distance = Math.abs(distanceSlots);
  if (!(distance < DOCK_WINDOW_SLOTS)) return 0; // `!(… < …)` also catches NaN
  return 0.5 * (1 + Math.cos((Math.PI * distance) / DOCK_WINDOW_SLOTS));
}
