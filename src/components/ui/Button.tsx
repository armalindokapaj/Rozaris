import { forwardRef } from "react";
import { cn } from "@/lib/utils";

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
