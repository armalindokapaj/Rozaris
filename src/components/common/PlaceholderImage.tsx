"use client";

import { Building2, Home, LayoutGrid, ImageIcon, User, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const GRADIENTS: Array<[string, string]> = [
  ["#e9e5ff", "#c9c1ff"],
  ["#dcebff", "#b7d4ff"],
  ["#ffe9d6", "#ffd2a8"],
  ["#e3f3ea", "#bfe4cf"],
  ["#f3e3f0", "#e3bfe0"],
  ["#eef1ff", "#d3d9ff"],
];

function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

type Kind = "interior" | "facade" | "floorplan" | "hero" | "avatar" | "gallery" | "video";

const ICONS: Record<Kind, typeof Home> = {
  interior: Home,
  facade: Building2,
  floorplan: LayoutGrid,
  hero: Building2,
  avatar: User,
  gallery: ImageIcon,
  video: PlayCircle,
};

export function PlaceholderImage({
  seed,
  kind = "interior",
  className,
  iconClassName,
}: {
  seed: string;
  kind?: Kind;
  className?: string;
  iconClassName?: string;
}) {
  const idx = hash(seed) % GRADIENTS.length;
  const [from, to] = GRADIENTS[idx];
  const angle = (hash(seed + "a") % 4) * 45;
  const Icon = ICONS[kind];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})`,
      }}
      role="img"
      aria-label={`${kind} placeholder image`}
    >
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #17162280 0, #17162280 1px, transparent 1px, transparent 14px)",
        }}
      />
      <Icon
        className={cn(
          "relative text-neutral-0/70",
          iconClassName ?? "h-8 w-8"
        )}
        strokeWidth={1.5}
      />
    </div>
  );
}
