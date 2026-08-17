"use client";

import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { MODULE_ICONS, NAV_ITEMS, type ActiveModule } from "./types";

type NavId = Exclude<ActiveModule, "none">;

/**
 * Front Page PRD §5-9 — the primary bottom navigation. Rebuilt (direct
 * design reference, 2026-08-17) to a fixed-size icon-over-label pill:
 * every item always shows its label (no hover/tap reveal, no pill
 * resizing — genuinely static, unlike both predecessors: the original
 * GSAP-Flip whole-pill expand, and the tooltip-per-icon version that
 * briefly replaced it). The active item gets a filled rounded-top panel
 * behind it plus a brand-colored underline bar flush with the pill's
 * bottom edge; inactive items get a plain hover highlight, same
 * rounded-top shape, no underline.
 *
 * Sizing history, same day (2026-08-17): first built at `h-12` to match
 * ProjectIdentity's height exactly; bumped 25% to `h-[60px]` per direct
 * follow-up feedback (icon/label scaled up alongside it — 16px→20px icon,
 * 10px→12px label — rather than just adding empty vertical space). At
 * desktop (`lg:`) each item is still a fixed `w-24` (not content-width)
 * so all four are genuinely equal, regardless of label length —
 * "Explore" is the longest label now that "Sun & Time" was shortened to
 * "Time" (`viewer.sunTime` in en.ts/sq.ts), but this no longer depends on
 * which label happens to be longest. Buttons are `h-full` (fill the pill
 * exactly, no vertical padding of their own) so the active underline
 * sits flush against the container's real bottom edge with no extra
 * math.
 *
 * Below `lg`, items are `flex-1` instead (mobile fit-width fix, direct
 * design feedback, 2026-08-17) — real bug found live-testing: 4 fixed
 * `w-24` items (~424px total incl. padding/gaps) is wider than many real
 * phone viewports, so the pill was overflowing/clipping off the left
 * edge instead of actually being centered. `flex-1` divides whatever
 * width `ViewerHUD`'s own `navRef` actually gives this bar (now the full
 * viewport minus the header's own inset, see that component's doc
 * comment) evenly across the 4 items, same as `getViewerLayoutState`'s
 * sibling components already do for their own mobile-vs-desktop split.
 *
 * "Explore" is still the default/fallback active module — it's the
 * always-available free-orbit camera mode (§14), not a real overlay, so
 * clicking it while already active is a no-op; clicking a different item
 * switches to it, and clicking that same active item again returns to
 * Explore.
 */
export function ViewerNavigation({
  activeModule,
  onSelect,
  className,
}: {
  activeModule: ActiveModule;
  onSelect: (id: NavId) => void;
  className?: string;
}) {
  const { t } = useT();

  function handleClick(id: NavId) {
    if (id === "explore") {
      if (activeModule !== "explore") onSelect("explore");
    } else if (activeModule === id) {
      onSelect("explore");
    } else {
      onSelect(id);
    }
  }

  return (
    // `rounded-panel` (was `rounded-pill`) — direct design feedback: this
    // container's own corner radius should match ProjectIdentity's
    // (top-left "ROZARIS" pill) exactly, not the fully-rounded stadium
    // shape. `overflow-hidden` — any edge item's (Explore/Time) rounded-
    // top highlight gets naturally clipped to the outer container's own
    // curve instead of a square corner poking past it. No vertical
    // padding: the buttons are `h-full` and fill this container's
    // `h-[60px]` exactly. `w-full lg:w-fit` — explicit rather than
    // relying on this div's implicit block-default width, matching this
    // session's own established practice after repeatedly hitting real
    // browser sizing quirks around implicit/intrinsic widths elsewhere in
    // this file tree.
    <div className={cn("viewer-glass flex h-[60px] w-full items-stretch gap-1 overflow-hidden rounded-panel px-3.5 sm:px-4 lg:w-fit", className)}>
      {NAV_ITEMS.map((id) => {
        const Icon = MODULE_ICONS[id];
        const isActive = activeModule === id;
        const label = t(`viewer.${id}`);
        return (
          <button
            key={id}
            type="button"
            onClick={() => handleClick(id)}
            aria-label={label}
            aria-pressed={isActive}
            className={cn(
              // `flex-1` below `lg`, fixed `w-24` at `lg`+ (see doc
              // comment above) — equal width per item either way,
              // regardless of label length.
              "relative flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-t-control transition-colors lg:w-24 lg:flex-none",
              isActive ? "bg-brand-500/10 text-brand-400" : "text-white/60 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="whitespace-nowrap text-xs font-medium leading-none">{label}</span>
            {/* Active-item underline — spans exactly this item's own
                width (not the whole pill), per the reference. */}
            {isActive && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-400" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
