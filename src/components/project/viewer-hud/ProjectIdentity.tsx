import Link from "next/link";

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
