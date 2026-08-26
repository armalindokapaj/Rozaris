import Link from "next/link";

/**
 * Front Page PRD §3 — compact ROZARIS | Project Name / Developer · City
 * plate. Deliberately plain (no icon, low visual weight per the PRD's
 * explicit "must never dominate the project" requirement) — the one kept
 * behavior from the pre-rebuild header is the ROZARIS wordmark linking
 * back to /search, since that's real existing navigation, not something
 * this PRD asked to remove.
 *
 * The wordmark + divider used to be `hidden sm:block`, i.e. desktop-only;
 * they now render at every width (direct instruction, 2026-08-26: the logo
 * belongs in the viewer's top-left corner on mobile exactly as it is on
 * desktop). Mobile gets `text-xs` rather than the desktop `text-sm` — the
 * same one-step scale-down the two text lines below already use (13px/11px
 * vs 14px/12px), which both keeps the wordmark under the project name in
 * weight per this PRD's "must never dominate the project" rule and buys
 * back ~10px for the `truncate`d developer · city line, the tightest thing
 * in this plate on a narrow phone.
 *
 * Fixed `h-12` (direct design feedback, 2026-08-17) — this is the
 * reference height every other piece of viewer chrome now matches:
 * NorthCompass, ViewerUtilities, and ViewerNavigation. Previously this
 * pill's height was organic (driven by its two lines of text + `py-2`),
 * which is what everything else *used* to independently approximate
 * (`h-11`) rather than actually match.
 */
export function ProjectIdentity({
  projectName,
  developerName,
  city,
}: {
  projectName: string;
  developerName: string;
  city: string;
}) {
  return (
    <div className="viewer-glass flex h-12 min-w-0 items-center gap-2.5 rounded-panel px-3.5 sm:gap-3 sm:px-4">
      <Link
        href="/search"
        className="shrink-0 font-serif text-xs tracking-[0.14em] text-white transition-colors hover:text-white/70 sm:text-sm"
      >
        ROZARIS
      </Link>
      <span className="h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold leading-tight text-white sm:text-sm">{projectName}</p>
        <p className="truncate text-[11px] leading-tight text-white/60 sm:text-xs">
          {developerName} · {city}
        </p>
      </div>
    </div>
  );
}
