"use client";

import { useCallback, useEffect, useState } from "react";
import type { SyncRowChange, SyncRowError } from "@/lib/integrations/inventorySync";
import type { ColumnMappingValue, SyncableField } from "@/lib/integrations/normalization";

export interface InventoryConnector {
  id: string;
  projectId: string;
  type: "google_sheets" | "api" | "manual";
  status: "active" | "paused" | "error";
  externalResourceId: string | null;
  configuration: { gid?: string } | null;
  columnMapping: Record<string, ColumnMappingValue> | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  createdAt: string;
}

export interface InventorySyncRun {
  id: string;
  status: string;
  rowsRead: number;
  rowsChanged: number;
  rowsRejected: number;
  errors: SyncRowError[] | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SyncOutcome {
  syncRunId: string | null;
  dryRun: boolean;
  status: "success" | "partial" | "error";
  rowsRead: number;
  rowsChanged: number;
  rowsRejected: number;
  rowsUnchanged: number;
  errors: SyncRowError[];
  changes: SyncRowChange[];
  sheet: { headers: string[]; recognized: Record<string, SyncableField>; ignored: string[] } | null;
}

export function useInventoryConnector(projectId: string) {
  const [connector, setConnector] = useState<InventoryConnector | null>(null);
  const [runs, setRuns] = useState<InventorySyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRuns = useCallback(async (connectorId: string) => {
    const res = await fetch(`/api/admin/inventory-connectors/${connectorId}/sync-runs`);
    setRuns(res.ok ? await res.json() : []);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/inventory-connectors?projectId=${encodeURIComponent(projectId)}`);
      const rows: InventoryConnector[] = res.ok ? await res.json() : [];
      const sheets = rows.find((c) => c.type === "google_sheets") ?? null;
      setConnector(sheets);
      if (sheets) await loadRuns(sheets.id);
      else setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, loadRuns]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = useCallback(
    async (url: string, init: RequestInit): Promise<{ ok: boolean; error?: string; data?: unknown }> => {
      setBusy(true);
      try {
        const res = await fetch(url, init);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            typeof body?.error === "string"
              ? body.error
              : body?.error
                ? JSON.stringify(body.error)
                : `Request failed (${res.status}).`;
          return { ok: false, error: message, data: body };
        }
        return { ok: true, data: body };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Request failed." };
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const connect = useCallback(
    async (sheetUrl: string) => {
      const result = await call("/api/admin/inventory-connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type: "google_sheets", sheetUrl }),
      });
      if (result.ok) await load();
      return result;
    },
    [call, load, projectId]
  );

  const update = useCallback(
    async (patch: { sheetUrl?: string; status?: string; columnMapping?: Record<string, ColumnMappingValue> }) => {
      if (!connector) return { ok: false, error: "No connector." };
      const result = await call(`/api/admin/inventory-connectors/${connector.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (result.ok) await load();
      return result;
    },
    [call, connector, load]
  );

  const disconnect = useCallback(async () => {
    if (!connector) return { ok: false, error: "No connector." };
    const result = await call(`/api/admin/inventory-connectors/${connector.id}`, { method: "DELETE" });
    if (result.ok) {
      setConnector(null);
      setRuns([]);
    }
    return result;
  }, [call, connector]);

  const sync = useCallback(
    async (dryRun: boolean) => {
      if (!connector) return { ok: false as const, error: "No connector.", data: undefined, outcome: undefined };
      const result = await call(`/api/admin/inventory-connectors/${connector.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (result.ok && !dryRun) await load();
      return { ...result, outcome: result.data as SyncOutcome | undefined };
    },
    [call, connector, load]
  );

  return { connector, runs, loading, busy, connect, update, disconnect, sync, refresh: load };
}
