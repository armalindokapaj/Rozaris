"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, MessageSquare, Home, Box } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { usePublisherLeads } from "@/hooks/usePublisherLeads";
import { formatRelativeDate } from "@/lib/utils";
import type { LeadItem, LeadSource, LeadStatus, Listing, Project } from "@/lib/types";

const PIPELINE: LeadStatus[] = ["new", "contacted", "qualified", "viewing", "negotiating", "won", "lost"];

const STATUS_LABEL_KEY: Record<LeadStatus, string> = {
  new: "leads.statusNew",
  contacted: "leads.statusContacted",
  qualified: "leads.statusQualified",
  viewing: "leads.statusViewing",
  negotiating: "leads.statusNegotiating",
  won: "leads.statusWon",
  lost: "leads.statusLost",
};

const SOURCE_LABEL_KEY: Record<LeadSource, string> = {
  phone_click: "leads.sourcePhone",
  whatsapp_click: "leads.sourceWhatsapp",
  listing_inquiry: "leads.sourceListingInquiry",
  digital_twin_inquiry: "leads.sourceDigitalTwin",
};

const SOURCE_ICON: Record<LeadSource, typeof Phone> = {
  phone_click: Phone,
  whatsapp_click: MessageSquare,
  listing_inquiry: Home,
  digital_twin_inquiry: Box,
};

/** Business Publisher's unified lead inbox (PRD_ROZARIS_User_Types §4
 * "Leads") — pipeline New→Contacted→Qualified→Viewing→Negotiation→Won→Lost.
 * Real `LeadItem` rows via `usePublisherLeads()`/`GET /api/business/leads`
 * — was `buildDemoLeads()`, which fabricated a fresh batch of fake leads
 * every session; see the launch-readiness audit that found this. Leads
 * are only ever real today from a phone/WhatsApp click on this
 * publisher's content (`POST /api/analytics/track`'s producer), so this
 * starts empty until that actually happens — no `listing_inquiry`/
 * `digital_twin_inquiry` producer exists yet. */
export function LeadsTab({ listings, projects }: { listings: Listing[]; projects: Project[] }) {
  const { t, locale } = useT();
  const { leads, setStatus: setLeadStatus, setNotes: setLeadNotes } = usePublisherLeads();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  function targetFor(lead: LeadItem): { title: string; href: string } | null {
    if (lead.listingId) {
      const l = listings.find((x) => x.id === lead.listingId);
      return l ? { title: l.title, href: `/listing/${l.slug}` } : null;
    }
    if (lead.projectId) {
      const p = projects.find((x) => x.id === lead.projectId);
      return p ? { title: p.name, href: `/project/${p.slug}` } : null;
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.tabLeads")}</h1>
        <p className="text-sm text-neutral-500">{t("leads.subtitle")}</p>
      </div>

      {leads.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("leads.empty")}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto scroll-thin pb-2">
          {PIPELINE.map((stage) => {
            const stageLeads = leads.filter((l) => l.status === stage);
            return (
              <div key={stage} className="w-64 shrink-0 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                    {t(STATUS_LABEL_KEY[stage])}
                  </p>
                  <span className="text-xs font-semibold text-neutral-400">{stageLeads.length}</span>
                </div>
                <div className="space-y-2">
                  {stageLeads.map((lead) => {
                    const target = targetFor(lead);
                    const Icon = SOURCE_ICON[lead.source];
                    const isOpen = openId === lead.id;
                    return (
                      <div key={lead.id} className="rounded-panel border border-neutral-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {target ? (
                              <Link
                                href={target.href}
                                className="block truncate text-xs font-semibold text-neutral-900 hover:text-brand-600"
                              >
                                {target.title}
                              </Link>
                            ) : (
                              <p className="truncate text-xs font-semibold text-neutral-900">{t("leads.untitled")}</p>
                            )}
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500">
                              <Icon className="h-3 w-3" /> {t(SOURCE_LABEL_KEY[lead.source])}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] text-neutral-400">
                            {formatRelativeDate(lead.createdAt, locale)}
                          </span>
                        </div>

                        <select
                          value={lead.status}
                          onChange={(e) => setLeadStatus(lead.id, e.target.value as LeadStatus)}
                          className="mt-2 w-full rounded-control border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[11px] font-medium text-neutral-700"
                        >
                          {PIPELINE.map((s) => (
                            <option key={s} value={s}>
                              {t(STATUS_LABEL_KEY[s])}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => setOpenId(isOpen ? null : lead.id)}
                          className="mt-1.5 text-[11px] font-semibold text-brand-600 hover:underline"
                        >
                          {isOpen ? t("leads.hideNotes") : t("leads.addNotes")}
                        </button>

                        {isOpen && (
                          <textarea
                            value={draftNotes[lead.id] ?? lead.notes ?? ""}
                            onChange={(e) => setDraftNotes((d) => ({ ...d, [lead.id]: e.target.value }))}
                            onBlur={(e) => setLeadNotes(lead.id, e.target.value)}
                            placeholder={t("leads.notesPlaceholder")}
                            rows={2}
                            className="mt-1.5 w-full resize-none rounded-control border border-neutral-200 px-2 py-1.5 text-[11px] text-neutral-700 focus:border-brand-400 focus:outline-none"
                          />
                        )}
                      </div>
                    );
                  })}
                  {stageLeads.length === 0 && (
                    <p className="rounded-control border border-dashed border-neutral-200 px-2 py-3 text-center text-[11px] text-neutral-300">
                      —
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
