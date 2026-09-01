"use client";

import { usePathname, useRouter } from "next/navigation";
import { Heart, Map as MapIcon, Search, SquareStack, User } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export function MobileBottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const auth = useAppStore((s) => s.auth);
  const openSignIn = useAppStore((s) => s.openSignIn);
  const setMode = useAppStore((s) => s.setMode);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const compareCount = useAppStore((s) => s.compare.length);
  const savedCount = useAppStore((s) => s.saved.listings.length + s.saved.projects.length);

  const items: {
    key: string;
    label: string;
    icon: typeof MapIcon;
    active: boolean;
    badge?: number;
    onClick: () => void;
  }[] = [
    {
      key: "map",
      label: t("nav.map"),
      icon: MapIcon,
      active: pathname === "/search",
      onClick: () => {
        setMode("map");
        router.push("/search");
      },
    },
    {
      key: "search",
      label: t("nav.search"),
      icon: Search,
      active: false,
      onClick: () => router.push("/search"),
    },
    {
      key: "saved",
      label: t("nav.saved"),
      icon: Heart,
      active: pathname === "/saved",
      badge: savedCount,
      onClick: () => (auth.signedIn ? router.push("/saved") : openSignIn()),
    },
    {
      key: "compare",
      label: t("nav.compare"),
      icon: SquareStack,
      active: false,
      badge: compareCount,
      onClick: () => setCompareOverlayOpen(true),
    },
    {
      key: "profile",
      label: t("nav.profile"),
      icon: User,
      active: pathname.startsWith("/dashboard") || pathname.startsWith("/buyer/dashboard"),
      onClick: () => (auth.signedIn ? router.push("/dashboard") : openSignIn()),
    },
  ];

  return (
    <nav
      aria-label={t("common.mobileNav")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map(({ key, label, icon: Icon, active, badge, onClick }) => (
        <button
          key={key}
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium",
            active ? "text-neutral-900" : "text-neutral-400"
          )}
        >
          <span className="relative">
            <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 2} />
            {!!badge && (
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-500 px-0.5 text-[9px] font-bold text-white">
                {badge}
              </span>
            )}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
