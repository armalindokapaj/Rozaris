"use client";

import { useState } from "react";
import Link from "next/link";
import { Send, MessageCircle } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import type { Conversation } from "@/lib/types";

/**
 * Shared buyer<->publisher conversation list + thread view. Which
 * conversations are visible, and whose messages render as "own" bubbles, is
 * entirely determined by the caller (Buyer dashboard passes conversations
 * for the demo buyer, Publisher dashboard passes conversations for the demo
 * publisher) — this component has no opinion on the viewer's role beyond
 * displaying the other participant's name/avatar seed.
 */
export function MessagesPanel({
  conversations,
  viewerId,
}: {
  conversations: Conversation[];
  viewerId: string;
}) {
  const { t, locale } = useT();
  const sendMessage = useAppStore((s) => s.sendMessage);
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id ?? null);
  const [draft, setDraft] = useState("");

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function handleSend() {
    if (!selected || !draft.trim()) return;
    sendMessage(selected.id, draft);
    setDraft("");
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-neutral-300 bg-white p-12 text-center">
        <MessageCircle className="h-8 w-8 text-neutral-300" />
        <p className="text-sm text-neutral-500">{t("messages.noConversations")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-panel border border-neutral-200 bg-white sm:grid-cols-[260px_1fr] sm:h-[560px]">
      <div className="divide-y divide-neutral-100 overflow-y-auto scroll-thin border-b border-neutral-100 sm:border-b-0 sm:border-r">
        {conversations.map((c) => {
          const other = c.buyerId === viewerId ? c.publisherName : c.buyerName;
          const last = c.messages[c.messages.length - 1];
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex w-full items-center gap-3 p-3 text-left hover:bg-neutral-50 ${
                selected?.id === c.id ? "bg-brand-50" : ""
              }`}
            >
              <PlaceholderImage
                seed={c.id}
                kind="avatar"
                className="h-10 w-10 shrink-0 rounded-full"
                iconClassName="h-4 w-4"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">{other}</p>
                <p className="truncate text-xs text-neutral-500">{last?.text}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-neutral-400">
            {t("messages.selectConversation")}
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-neutral-100 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-900">
                {selected.buyerId === viewerId ? selected.publisherName : selected.buyerName}
              </p>
              {selected.listingTitle && (
                <Link
                  href={selected.listingSlug ? `/listing/${selected.listingSlug}` : "#"}
                  className="text-xs text-brand-600 hover:underline"
                >
                  {t("messages.regardingListing", { title: selected.listingTitle })}
                </Link>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scroll-thin p-4">
              {selected.messages.map((m) => {
                const isOwn = m.senderId === viewerId;
                return (
                  <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-card px-3.5 py-2.5 text-sm ${
                        isOwn
                          ? "bg-brand-500 text-white"
                          : "border border-neutral-200 bg-neutral-50 text-neutral-800"
                      }`}
                    >
                      <p className="whitespace-pre-line">{m.text}</p>
                      <p className={`mt-1 text-[10px] ${isOwn ? "text-white/70" : "text-neutral-400"}`}>
                        {formatRelativeDate(m.createdAt, locale)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-neutral-100 p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                placeholder={t("messages.typePlaceholder")}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim()}
                aria-label={t("messages.send")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-500 text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
