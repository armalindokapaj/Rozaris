import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Canonical popover shell + menu item for every dropdown/menu on the
 * public site (filter pills, sort menus, the account menu, the language/
 * currency switcher, …). Pair with `useDropdown` for the open/close
 * wiring. This does not replace `<select>` for plain native form fields —
 * it's for the custom popovers the app already builds by hand.
 *
 * Fixes the drift the audit found across the four hand-rolled instances:
 * FilterDropdown used `rounded-none` + a one-off `shadow-[0_3px_9px_...]`
 * instead of the `rounded-card`/`shadow-2` every other popover on the
 * site uses; menu items varied between `rounded-lg` (non-token) call
 * sites. Both are pinned here to the token values instead.
 */
export function DropdownPanel({
  align = "right",
  openUpward = false,
  width = "w-56",
  role = "menu",
  className,
  children,
}: {
  align?: "left" | "right";
  openUpward?: boolean;
  /** Tailwind width utility, e.g. "w-56" or "w-full". */
  width?: string;
  role?: "menu" | "listbox";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        "absolute z-40 max-w-[calc(100vw-2rem)] rounded-card border border-neutral-200 bg-neutral-0 p-2 shadow-[var(--shadow-2)]",
        width,
        align === "right" ? "right-0" : "left-0",
        openUpward ? "bottom-full mb-2" : "top-full mt-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
      {children}
    </p>
  );
}

export function DropdownSeparator() {
  return <div className="my-1.5 h-px bg-neutral-100" aria-hidden="true" />;
}

type DropdownMenuItemBaseProps = {
  icon?: React.ReactNode;
  /** Shows a trailing brand check mark — for single/radio selection lists. */
  selected?: boolean;
  variant?: "default" | "danger";
  role?: "menuitem" | "menuitemradio" | "option";
  className?: string;
  children: React.ReactNode;
};

type DropdownMenuItemAsButton = DropdownMenuItemBaseProps & {
  href?: undefined;
  onClick?: () => void;
};

type DropdownMenuItemAsLink = DropdownMenuItemBaseProps & {
  href: string;
  onClick?: () => void;
};

export function DropdownMenuItem(props: DropdownMenuItemAsButton | DropdownMenuItemAsLink) {
  const { icon, selected, variant = "default", role = "menuitem", className, children, onClick } = props;
  const content = (
    <>
      {icon}
      <span className="flex-1 text-left">{children}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
    </>
  );
  const sharedClassName = cn(
    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
    variant === "danger" ? "text-danger hover:bg-danger/10" : "text-neutral-700 hover:bg-neutral-100",
    className
  );

  if ("href" in props && props.href) {
    return (
      <Link
        href={props.href}
        onClick={onClick}
        role={role}
        aria-checked={role === "menuitemradio" ? selected : undefined}
        className={sharedClassName}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      role={role}
      aria-checked={role === "menuitemradio" ? selected : undefined}
      aria-selected={role === "option" ? selected : undefined}
      className={sharedClassName}
    >
      {content}
    </button>
  );
}
