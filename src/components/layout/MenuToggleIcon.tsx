import { cn } from "@/lib/utils";

/**
 * Hamburger ↔ close as one continuously-morphing glyph, not two lucide
 * icons (Menu/X) swapped instantly. Top and bottom bars rotate + slide to
 * the center to form the X; the middle bar doesn't just fade in place —
 * it slides out to the right as it disappears, so the motion reads as
 * "the middle bar leaves, the outer two bars pivot into an X" rather than
 * three lines just melting into each other.
 */
export function MenuToggleIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <span className={cn("relative flex h-5 w-5 shrink-0 items-center justify-center", className)}>
      <span
        className={cn(
          "absolute h-[1.5px] w-5 rounded-full bg-current transition-transform duration-300 ease-[var(--ease-rz)]",
          open ? "translate-y-0 rotate-45" : "-translate-y-[6px] rotate-0"
        )}
      />
      <span
        className={cn(
          "absolute h-[1.5px] w-5 rounded-full bg-current transition-[transform,opacity] duration-200 ease-[var(--ease-rz)]",
          open ? "translate-x-3 opacity-0" : "translate-x-0 opacity-100"
        )}
      />
      <span
        className={cn(
          "absolute h-[1.5px] w-5 rounded-full bg-current transition-transform duration-300 ease-[var(--ease-rz)]",
          open ? "translate-y-0 -rotate-45" : "translate-y-[6px] rotate-0"
        )}
      />
    </span>
  );
}
