"use client";

import { useCallback, useEffect, useState } from "react";
import type { LeadItem, LeadSource, LeadStatus } from "@/lib/types";

interface RawLead {
  id: string;
  publisherId: string;
  listingId: string | null;
  projectId: string | null;
  source: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

function normalize(row: RawLead): LeadItem {
  return {
    id: row.id,
    publisherId: row.publisherId,
    listingId: row.listingId ?? undefined,
    projectId: row.projectId ?? undefined,
    source: row.source as LeadSource,
    status: row.status as LeadStatus,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
  };
}

export function usePublisherLeads() {
  const [leads, setLeads] = useState<LeadItem[] | null>(null);

  const load = useCallback(() => {
    fetch("/api/business/leads")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RawLead[]) => setLeads(rows.map(normalize)))
      .catch(() => setLeads([]));
  }, []);

  useEffect(load, [load]);

  const setStatus = useCallback((id: string, status: LeadStatus) => {
    setLeads((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, status } : l)));
    fetch(`/api/business/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }, []);

  const setNotes = useCallback((id: string, notes: string) => {
    setLeads((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, notes } : l)));
    fetch(`/api/business/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    }).catch(() => {});
  }, []);

  return { leads: leads ?? [], loading: leads === null, setStatus, setNotes };
}
