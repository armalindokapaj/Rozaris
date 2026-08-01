"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Heart, LayoutDashboard, LogOut, ShieldCheck, User } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { auth, signIn, signOut } = useAppStore();
  const { t } = useT();
  useClickOutside(ref, () => setOpen(false), open);

  if (!auth.signedIn) {
    return (
      <button
        type="button"
        onClick={() => signIn("John Doe", "publisher")}
        className="rounded-control bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition-colors"
      >
        {t("common.signIn")}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-control py-1 pl-1 pr-2 hover:bg-neutral-100 transition-colors"
      >
        <PlaceholderImage
          seed={auth.name ?? "user"}
          kind="avatar"
          className="h-8 w-8 rounded-full"
          iconClassName="h-4 w-4"
        />
        <ChevronDown className="h-4 w-4 text-neutral-500" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 rounded-card border border-neutral-200 bg-white p-2 shadow-xl"
        >
          <div className="flex items-center gap-3 px-2 py-2">
            <PlaceholderImage
              seed={auth.name ?? "user"}
              kind="avatar"
              className="h-10 w-10 rounded-full"
              iconClassName="h-5 w-5"
            />
            <div>
              <p className="text-sm font-semibold text-neutral-900">{auth.name}</p>
              <p className="text-xs capitalize text-neutral-500">{auth.role}</p>
            </div>
          </div>
          <div className="my-1.5 h-px bg-neutral-100" />
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <LayoutDashboard className="h-4 w-4" /> {t("nav.publisherDashboard")}
          </Link>
          <Link
            href="/buyer/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <Heart className="h-4 w-4" /> {t("nav.buyerDashboard")}
          </Link>
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <ShieldCheck className="h-4 w-4" /> {t("nav.adminConsole")}
          </Link>
          <Link
            href="/dashboard#profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <User className="h-4 w-4" /> {t("nav.profileSettings")}
          </Link>
          <div className="my-1.5 h-px bg-neutral-100" />
          <button
            onClick={() => {
              signOut();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> {t("nav.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
