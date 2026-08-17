"use client";

import { useEffect, useState } from "react";
import { useAdminSessionRepair } from "./useAdminSessionRepair";
import type { EnvironmentPresetConfig } from "@/lib/environmentPresetFields";

export interface EnvironmentPresetRow {
  id: string;
  name: string;
  config: EnvironmentPresetConfig;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// Same real bug fix as useDetailModelSlots.ts's identical helper (see its
// own doc comment) — a write route 401ing needs to surface a real sign-in
// prompt immediately, never a silent retry.
function fetchWithSessionRetry(
  input: string,
  init: RequestInit | undefined,
  onSessionExpired: () => void
): Promise<Response> {
  return fetch(input, init).then((res) => {
    if (res.status === 401) onSessionExpired();
    return res;
  });
}

/**
 * "1 preset for every Sun, Fog, Sunflare... setting, to use in other
 * projects" — the global Environment Presets library backing the
 * Experience Editor's Presets tab. Deliberately not project-scoped: it
 * fetches once, independent of whichever project's editor is currently
 * open, same "fetch once, own local list" shape as useDetailModelSlots.
 */
export function useEnvironmentPresets() {
  const { establishAdminSession } = useAdminSessionRepair();

  const [presets, setPresets] = useState<EnvironmentPresetRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  function flashMessage(message: string) {
    setFlash(message);
    setTimeout(() => setFlash(null), 2500);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/environment-presets")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: EnvironmentPresetRow[]) => {
        if (!cancelled) setPresets(rows);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function readError(res: Response): Promise<string> {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      return typeof parsed.error === "string" ? parsed.error : text;
    } catch {
      return text;
    }
  }

  async function saveAsNewPreset(name: string, config: EnvironmentPresetConfig): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithSessionRetry(
        "/api/environment-presets",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed, config }) },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await readError(res));
      const preset: EnvironmentPresetRow = await res.json();
      setPresets((prev) => [preset, ...prev]);
      flashMessage(`Saved "${preset.name}".`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save preset.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updatePresetConfig(presetId: string, config: EnvironmentPresetConfig): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithSessionRetry(
        `/api/environment-presets/${presetId}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await readError(res));
      const updated: EnvironmentPresetRow = await res.json();
      setPresets((prev) => prev.map((p) => (p.id === presetId ? updated : p)));
      flashMessage(`Updated "${updated.name}".`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update preset.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function renamePreset(presetId: string, name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithSessionRetry(
        `/api/environment-presets/${presetId}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed }) },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await readError(res));
      const updated: EnvironmentPresetRow = await res.json();
      setPresets((prev) => prev.map((p) => (p.id === presetId ? updated : p)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename preset.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deletePreset(presetId: string): Promise<boolean> {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return false;
    if (!window.confirm(`Delete the "${preset.name}" preset? This can't be undone.`)) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithSessionRetry(`/api/environment-presets/${presetId}`, { method: "DELETE" }, establishAdminSession);
      if (!res.ok) throw new Error(await readError(res));
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete preset.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { presets, loaded, busy, error, flash, saveAsNewPreset, updatePresetConfig, renamePreset, deletePreset };
}

export type UseEnvironmentPresetsReturn = ReturnType<typeof useEnvironmentPresets>;
