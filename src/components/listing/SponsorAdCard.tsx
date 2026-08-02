import type { LucideIcon } from "lucide-react";

/** Static sponsored-slot creative, generalized from AdBanner — same
 * "sponsor card" idea, different content per instance (bank, insurer,
 * etc). Tall, with a slowly animated visual, standing in for a real
 * animated ad creative. */
export function SponsorAdCard({
  icon: Icon,
  name,
  tagline,
}: {
  icon: LucideIcon;
  name: string;
  tagline: string;
}) {
  return (
    <div className="overflow-hidden rounded-card bg-neutral-900 text-white">
      <div
        className="rz-ad-shimmer flex h-40 items-center justify-center bg-gradient-to-br from-brand-500 via-neutral-800 to-neutral-900"
        aria-hidden
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
          <Icon className="h-8 w-8 text-brand-200" />
        </span>
      </div>
      <div className="p-4">
        <p className="text-sm font-bold">{name}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/60">{tagline}</p>
      </div>
    </div>
  );
}
