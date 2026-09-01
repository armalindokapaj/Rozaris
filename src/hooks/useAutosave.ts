"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseAutosaveOptions {
  debounceMs?: number;
  enabled?: boolean;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseAutosaveResult {
  status: AutosaveStatus;
  error: string | null;
  lastSavedAt: string | null;
  saveNow: () => Promise<void>;
}

export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<unknown>,
  options: UseAutosaveOptions = {}
): UseAutosaveResult {
  const { debounceMs = 1800, enabled = true } = options;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const valueRef = useRef(value);
  const saveRef = useRef(save);
  useEffect(() => {
    valueRef.current = value;
    saveRef.current = save;
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    if (!enabled) return;
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
