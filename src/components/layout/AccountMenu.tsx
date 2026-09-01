"use client";

import { ChevronDown, Heart, LayoutDashboard, LogOut, ShieldCheck, User } from "lucide-react";
import { signOut as nextAuthSignOut } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { useDropdown } from "@/hooks/useDropdown";
import { DropdownPanel, DropdownMenuItem, DropdownSeparator } from "@/components/ui/Dropdown";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { JoinMenu } from "./JoinMenu";

export function AccountMenu() {
  const { open, toggle, close, ref } = useDropdown<HTMLDivElement>();
  const { auth, signOut } = useAppStore();
  const { t } = useT();

  if (!auth.signedIn) {
    return <JoinMenu />;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
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
        <DropdownPanel width="w-60">
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
          <DropdownSeparator />
          <DropdownMenuItem href="/dashboard" onClick={close} icon={<LayoutDashboard className="h-4 w-4" />}>
            {t("nav.publisherDashboard")}
          </DropdownMenuItem>
          <DropdownMenuItem href="/buyer/dashboard" onClick={close} icon={<Heart className="h-4 w-4" />}>
            {t("nav.buyerDashboard")}
          </DropdownMenuItem>
          <DropdownMenuItem href="/admin" onClick={close} icon={<ShieldCheck className="h-4 w-4" />}>
            {t("nav.adminConsole")}
          </DropdownMenuItem>
          <DropdownMenuItem href="/dashboard#profile" onClick={close} icon={<User className="h-4 w-4" />}>
            {t("nav.profileSettings")}
          </DropdownMenuItem>
          <DropdownSeparator />
          <DropdownMenuItem
            variant="danger"
            icon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              close();
              signOut();
              await nextAuthSignOut({ redirect: false });
            }}
          >
            {t("nav.signOut")}
          </DropdownMenuItem>
        </DropdownPanel>
      )}
    </div>
  );
}
