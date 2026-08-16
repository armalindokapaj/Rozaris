import Link from "next/link";

/**
 * Front Page PRD §3 — compact ROZARIS | Project Name / Developer · City
 * plate. Deliberately plain (no icon, low visual weight per the PRD's
 * explicit "must never dominate the project" requirement) — the one kept
 * behavior from the pre-rebuild header is the ROZARIS wordmark linking
 * back to /search, since that's real existing navigation, not something
 * this PRD asked to remove.
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
    <div className="viewer-glass flex min-w-0 items-center gap-2.5 rounded-panel px-3.5 py-2 sm:gap-3 sm:px-4">
      <Link
        href="/search"
        className="hidden shrink-0 font-serif text-sm tracking-[0.14em] text-white transition-colors hover:text-white/70 sm:block"
      >
        ROZARIS
      </Link>
      <span className="hidden h-5 w-px shrink-0 bg-white/15 sm:block" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold leading-tight text-white sm:text-sm">{projectName}</p>
        <p className="truncate text-[11px] leading-tight text-white/60 sm:text-xs">
          {developerName} · {city}
        </p>
      </div>
    </div>
  );
}
