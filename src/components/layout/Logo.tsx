"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 shrink-0 font-semibold tracking-tight text-neutral-900",
        className
      )}
      aria-label={`ROZARIS — ${t("nav.home")}`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-500 text-white text-lg font-bold">
        R
      </span>
      <span className="text-lg font-bold hidden sm:inline">ROZARIS</span>
    </Link>
  );
}
