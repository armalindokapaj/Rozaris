"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseAutosaveOptions {
  /** Idle-quiescence window (ms) before a change triggers an actual save
   * request. Default 1800ms — deliberately longer than useUndoRedo's
   * ~500ms coalesce window, so autosave fires after an undo step has
   * already settled, not mid-drag/mid-burst. */
  debounceMs?: number;
  /** Set false to pause autosave entirely — e.g. before there's an active
   * draft version to save the detail-model fields against. */
  enabled?: boolean;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseAutosaveResult {
  status: AutosaveStatus;
  error: string | null;
  /** ISO timestamp of the last successful save, for a "Saved 2m ago"-style
   * display (e.g. via src/lib/utils.ts's `formatRelativeDate`). Null until
   * the first save completes. */
  lastSavedAt: string | null;
  /** Bypasses the debounce and saves the current value immediately —
   * kept as the "Save Draft" button's action (see
   * Project3DConfigEditor.tsx) rather than removing manual save outright. */
  saveNow: () => Promise<void>;
}

/**
 * Generic debounced autosave — Phase 2 (Editor UX rebuild), Milestone D.
 * Not 3D-specific. Two independent instances are used in
 * Project3DConfigEditor.tsx — one for the `Project3DConfig` (`draft`) save
 * target, one for the detail-model save target — matching the two
 * independent save mechanisms that already existed before this phase.
 * Deliberately never wired to Publish, which stays a manual, explicit
 * action only.
 *
 * Verification note: this hook is effect/timer-driven (not a pure
 * reducer like useUndoRedo's historyReducer), so it isn't exercisable by
 * a framework-free script the same rigorous way — this repo has no
 * jest/vitest to run a fake-timers test either. Verified by `tsc`/lint/
 * build cleanliness and careful review of the token/timer logic below;
 * whether a save visibly fires ~1.8s after an idle edit in a real browser
 * is NOT independently confirmed in this environment (no browser tool
 * available here — same caveat as the rest of this session's viewer
 * work).
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<unknown>,
  options: UseAutosaveOptions = {}
): UseAutosaveResult {
  const { debounceMs = 1800, enabled = true } = options;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Refs, not state — `value`/`save` change every render (new object/
  // closure) but reading the *latest* one at save-time shouldn't itself
  // trigger a re-render or re-run the scheduling effect below. Synced in
  // an effect (not assigned directly during render) — mutating a ref's
  // `.current` while rendering is itself a lint error (react-hooks/refs)
  // and a real footgun under concurrent rendering.
  const valueRef = useRef(value);
  const saveRef = useRef(save);
  useEffect(() => {
    valueRef.current = value;
    saveRef.current = save;
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ignores a stale save's completion if a newer one started meanwhile
  // (e.g. saveNow() called while a debounce-triggered save is still
  // in flight) — the older promise settling shouldn't overwrite the
  // newer one's status.
  const tokenRef = useRef(0);
  const isFirstRunRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runSave = useCallback(async () => {
    clearTimer();
    const token = ++tokenRef.current;
    const v = valueRef.current;
    setStatus("saving");
    setError(null);
    try {
      await saveRef.current(v);
      if (token === tokenRef.current) {
        setStatus("saved");
        setLastSavedAt(new Date().toISOString());
      }
    } catch (err) {
      if (token === tokenRef.current) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Save failed");
      }
    }
  }, [clearTimer]);

  // Schedules (or reschedules) a debounced save whenever `value` changes
  // by reference — every real edit produces a new object (spread-based
  // updates, same as useUndoRedo's snapshot), so reference equality here
  // correctly means "something changed," with no deep-compare needed.
  useEffect(() => {
    if (!enabled) return;
    // Skip the run that first observes a value (mount, or the render
    // where `enabled` first flips true) — that value is hydration/initial
    // state, not a user edit; nothing to save yet.
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave();
    }, debounceMs);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, debounceMs]);

  useEffect(() => clearTimer, [clearTimer]);

  const saveNow = useCallback(() => runSave(), [runSave]);

  return { status, error, lastSavedAt, saveNow };
}
