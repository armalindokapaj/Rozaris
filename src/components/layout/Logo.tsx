"use client";

import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  const { t } = useT();
  const setTransaction = useAppStore((s) => s.setTransaction);
  return (
    <Link
      href="/"
      onClick={() => setTransaction("buy")}
      className={cn("flex shrink-0 items-center font-serif text-neutral-900", className)}
      aria-label={`ROZARIS — ${t("nav.home")}`}
    >
      {                                                                    
                                                                  }
      <span className="text-lg font-bold tracking-[0.24em] sm:text-xl sm:font-normal sm:tracking-[0.22em]">ROZARIS</span>
    </Link>
  );
}
