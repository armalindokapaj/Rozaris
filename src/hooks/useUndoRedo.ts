"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { historyReducer, initialHistoryState } from "@/lib/historyReducer";

interface UseUndoRedoOptions {
  coalesceMs?: number;
}

export interface UseUndoRedoResult<T> {
  state: T;
  set: (updater: T | ((prev: T) => T), opts?: { commit?: boolean }) => void;
  setSilent: (updater: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo<T>(initial: T, options: UseUndoRedoOptions = {}): UseUndoRedoResult<T> {
  const { coalesceMs = 500 } = options;
  const [history, dispatch] = useReducer(historyReducer<T>, initial, initialHistoryState);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const set = useCallback(
    (updater: T | ((prev: T) => T), opts?: { commit?: boolean }) => {
      const commit = !!opts?.commit;
      clearTimer();
      dispatch({ type: "set", updater, commit });
      if (!commit) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          dispatch({ type: "flushPending" });
        }, coalesceMs);
      }
    },
    [clearTimer, coalesceMs]
  );

  const setSilent = useCallback((updater: T | ((prev: T) => T)) => {
    dispatch({ type: "setSilent", updater });
  }, []);

  const undo = useCallback(() => {
    clearTimer();
    dispatch({ type: "undo" });
  }, [clearTimer]);

  const redo = useCallback(() => {
    dispatch({ type: "redo" });
  }, []);

  return {
    state: history.present,
    set,
    setSilent,
    undo,
    redo,
    canUndo: history.past.length > 0 || history.hasPending,
    canRedo: history.future.length > 0,
  };
}
