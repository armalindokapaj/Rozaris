"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, MessageCircle, Phone } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useT } from "@/lib/i18n/useT";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { cn, telHref, whatsappHref } from "@/lib/utils";
import type { Publisher } from "@/lib/types";

const TYPE_LABEL_KEY: Record<Publisher["type"], string> = {
  private_owner: "publisher.typePrivateOwner",
  agency: "publisher.typeAgency",
  developer: "publisher.typeDeveloper",
};

export function PublisherCard({
  publisher,
  whatsappMessage,
  contentTitle,
  contentUrl,
  bare = false,
  tone = "light",
  compact = false,
  trackEntity,
}: {
  publisher: Publisher;
  whatsappMessage: string;
  contentTitle: string;
  contentUrl: string;
  /** Skip the card's own border/background — for nesting inside a parent panel that already provides one. */
  bare?: boolean;
  /** `"dark"` for the 3D viewer's unit card, which is `.viewer-glass`
   * (#0c0e12) like every other HUD surface — the default light treatment
   * would put neutral-900 text on near-black. Only the four
   * surface-dependent colors change; WhatsApp keeps its own brand green,
   * which reads on either ground. */
  tone?: "light" | "dark";
  /** Tighter avatar/row/button sizing for a panel that has to fit inside
   * something else (again: the viewer's unit card, which is 384px wide and
   * shares its height with media, facts and a footer). */
  compact?: boolean;
  /** The listing/project this contact card belongs to — real WhatsApp/call
   * click tracking (see the "Rozaris Platform Audit" memory) fires here
   * when set; omitted call sites (if any) just don't track, same as before. */
  trackEntity?: { type: "listing" | "project"; id: string };
}) {
  const { t } = useT();
  const track = useTrackEvent();
  // The number reads first so people can see who they're about to reach;
  // clicking it (which also fires the tel: link) swaps the label to "Call".
  const [phoneClicked, setPhoneClicked] = useState(false);
  const dark = tone === "dark";
  return (
    <div className={cn(!bare && "rounded-panel border border-neutral-200 bg-white p-5")}>
      <Link
        href={`/developer/${publisher.slug}`}
        className="flex items-center gap-3 hover:opacity-90"
      >
        <PlaceholderImage
          seed={publisher.id}
          kind="avatar"
          className={cn("shrink-0 rounded-card", compact ? "h-9 w-9" : "h-12 w-12")}
          iconClassName={compact ? "h-4 w-4" : "h-5 w-5"}
        />
        <div className="min-w-0">
          <p
            className={cn(
              "flex items-center gap-1.5 truncate font-serif",
              compact ? "text-sm" : "text-base",
              dark ? "text-white" : "text-neutral-900"
            )}
          >
            {publisher.name}
            {publisher.verified && (
              <BadgeCheck className={cn("h-4 w-4 shrink-0", dark ? "text-brand-300" : "text-brand-500")} />
            )}
          </p>
          <p className={cn(compact ? "text-[11px]" : "text-xs", dark ? "text-white/45" : "text-neutral-500")}>
            {t(TYPE_LABEL_KEY[publisher.type])}
          </p>
        </div>
      </Link>

      <div className={cn("grid grid-cols-2 gap-2", compact ? "mt-2.5" : "mt-4")}>
        <a
          href={whatsappHref(publisher.whatsapp, `${whatsappMessage} — ${contentTitle} (${contentUrl})`)}
          target="_blank"
          rel="noopener noreferrer"
          data-analytics="whatsapp_clicked"
          onClick={() => trackEntity && track(trackEntity.type, trackEntity.id, "whatsapp_click")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-control bg-[#25D366] font-semibold text-white hover:brightness-95",
            compact ? "py-1.5 text-xs" : "py-2.5 text-sm"
          )}
        >
          <MessageCircle className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          {t("publisher.whatsapp")}
        </a>
        <a
          href={telHref(publisher.phone)}
          data-analytics="phone_clicked"
          onClick={() => {
            setPhoneClicked(true);
            if (trackEntity) track(trackEntity.type, trackEntity.id, "call_click");
          }}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-control border font-semibold",
            compact ? "py-1.5 text-xs" : "py-2.5 text-sm",
            dark
              ? "border-white/15 text-white/85 hover:bg-white/10 hover:text-white"
              : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
          )}
        >
          <Phone className={cn("shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          <span className="truncate">{phoneClicked ? t("publisher.call") : publisher.phone}</span>
        </a>
      </div>
    </div>
  );
}
