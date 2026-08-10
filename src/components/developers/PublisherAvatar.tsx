import { cn } from "@/lib/utils";
import type { Publisher } from "@/lib/types";

const AVATAR_GRADIENTS: Array<[string, string]> = [
  ["#8973f8", "#6b55f5"],
  ["#6f9bff", "#3d6fe0"],
  ["#e08fd0", "#c15fb0"],
  ["#f5a25c", "#e0803a"],
  ["#5cc9a7", "#2f9e7d"],
];

function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Gradient-square initial avatar for publisher cards/profiles — a lettered
 * mark reads closer to a real logo than PlaceholderImage's generic-icon
 * avatar (used for actual people, e.g. the account menu). */
export function PublisherAvatar({ publisher, className }: { publisher: Publisher; className?: string }) {
  const idx = hash(publisher.id) % AVATAR_GRADIENTS.length;
  const [from, to] = AVATAR_GRADIENTS[idx];
  return (
    <div
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-card font-serif text-white", className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {publisher.name.charAt(0).toUpperCase()}
    </div>
  );
}
