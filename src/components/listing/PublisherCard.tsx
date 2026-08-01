"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, MessageCircle, Phone } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useT } from "@/lib/i18n/useT";
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
}: {
  publisher: Publisher;
  whatsappMessage: string;
  contentTitle: string;
  contentUrl: string;
  /** Skip the card's own border/background — for nesting inside a parent panel that already provides one. */
  bare?: boolean;
}) {
  const { t } = useT();
  // The number reads first so people can see who they're about to reach;
  // clicking it (which also fires the tel: link) swaps the label to "Call".
  const [phoneClicked, setPhoneClicked] = useState(false);
  return (
    <div className={cn(!bare && "rounded-panel border border-neutral-200 bg-white p-5")}>
      <Link
        href={`/developer/${publisher.slug}`}
        className="flex items-center gap-3 hover:opacity-90"
      >
        <PlaceholderImage
          seed={publisher.id}
          kind="avatar"
          className="h-12 w-12 shrink-0 rounded-2xl"
          iconClassName="h-5 w-5"
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-neutral-900">
            {publisher.name}
            {publisher.verified && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-brand-500" />
            )}
          </p>
          <p className="text-xs text-neutral-500">{t(TYPE_LABEL_KEY[publisher.type])}</p>
        </div>
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={whatsappHref(publisher.whatsapp, `${whatsappMessage} — ${contentTitle} (${contentUrl})`)}
          target="_blank"
          rel="noopener noreferrer"
          data-analytics="whatsapp_clicked"
          className="flex items-center justify-center gap-1.5 rounded-control bg-[#25D366] py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          <MessageCircle className="h-4 w-4" />
          {t("publisher.whatsapp")}
        </a>
        <a
          href={telHref(publisher.phone)}
          data-analytics="phone_clicked"
          onClick={() => setPhoneClicked(true)}
          className="flex items-center justify-center gap-1.5 rounded-control border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <Phone className="h-4 w-4 shrink-0" />
          <span className="truncate">{phoneClicked ? t("publisher.call") : publisher.phone}</span>
        </a>
      </div>
    </div>
  );
}
