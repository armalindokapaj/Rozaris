"use client";

import { useRef, useState } from "react";
import { Share2, MessageCircle, Mail, Link2, Check } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();
  useClickOutside(ref, () => setOpen(false), open);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
      >
        <Share2 className="h-4 w-4" />
        {t("listing.share")}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-56 rounded-card border border-neutral-200 bg-white p-1.5 shadow-xl">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
              <MessageCircle className="h-4 w-4" />
            </span>
            {t("listing.shareViaWhatsapp")}
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Mail className="h-4 w-4" />
            </span>
            {t("listing.shareViaEmail")}
          </a>
          <button
            onClick={copyLink}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                copied ? "bg-green-50 text-green-600" : "bg-neutral-100 text-neutral-500"
              )}
            >
              {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            </span>
            {copied ? t("listing.linkCopied") : t("listing.copyLink")}
          </button>
        </div>
      )}
    </div>
  );
}
