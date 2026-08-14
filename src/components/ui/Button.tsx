import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical button styling for the public site (everything outside
 * /admin and the 3D Configurator/Viewer, which keep their own bespoke
 * chrome). Before this existed, every CTA across Landing/Search/Listing/
 * Developers/etc. hand-rolled its own Tailwind className blob — heights,
 * paddings, font sizes and even radii (rounded-control vs rounded-xl vs
 * no radius at all) all drifted independently. `buttonVariants` is the
 * single source of truth for that combination; use it directly (e.g. on a
 * `next/link`) when the trigger can't be a real `<button>`, otherwise
 * render `<Button>`.
 *
 * Variants map to existing token usage rather than inventing new ones:
 *  - primary   — bg-brand-500, the default "do the main thing" action.
 *  - accent    — bg-accent, reserved for the landing hero's single
 *                highest-priority CTA (see globals.css's --color-accent
 *                comment) — do not use for ordinary buttons.
 *  - secondary — bordered neutral surface, for the second action in a pair.
 *  - ghost     — no border/fill, for low-emphasis inline actions.
 *  - danger    — destructive actions (sign out, delete, remove).
 */
export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 disabled:hover:bg-brand-500",
  accent:
    "bg-accent text-neutral-900 font-extrabold uppercase tracking-[0.08em] hover:bg-accent-600 disabled:hover:bg-accent",
  secondary:
    "border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 hover:text-neutral-900 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700",
  ghost: "text-neutral-700 hover:bg-neutral-100 disabled:hover:bg-transparent",
  danger: "text-danger hover:bg-danger/10 disabled:hover:bg-transparent",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-10 gap-1.5 px-3.5 text-sm",
  lg: "h-12 gap-2 px-6 text-sm",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-control font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-rz)] disabled:cursor-not-allowed disabled:opacity-40",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && "w-full",
    className
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", fullWidth = false, className, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonVariants({ variant, size, fullWidth, className })}
      {...props}
    />
  );
});
