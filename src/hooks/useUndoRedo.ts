"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { historyReducer, initialHistoryState } from "@/lib/historyReducer";

interface UseUndoRedoOptions {
  /** Trailing-quiescence window (ms) before a burst of non-committed
   * `set()` calls (e.g. a slider drag) becomes one undo step. Default
   * 500ms — tuned to feel like "the drag just ended", not to add
   * perceptible lag to the live preview (which always updates
   * synchronously regardless of this value, since `state` is the
   * reducer's `present` on every dispatch, commit or not). */
  coalesceMs?: number;
}

export interface UseUndoRedoResult<T> {
  state: T;
  set: (updater: T | ((prev: T) => T), opts?: { commit?: boolean }) => void;
  /** Replaces `state` without creating (or being able to trigger) an undo
   * step — for syncing from an external source of truth (initial load,
   * the row echoed back after a save), never for a user edit. */
  setSilent: (updater: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Generic undo/redo history stack — Phase 2 (Editor UX rebuild), Milestone
 * C. Not 3D-specific: wraps any value type `T`. `useProject3DEditorState`
 * is the one call site, wrapping the editor's combined editable-state
 * object (draft + scale/rotation/altitude/linkSelections/nodeOverrides) —
 * NOT `selectedNodeRzId`/`sceneManifest`, which are navigation/derived
 * state, not user edits (undoing a tree-selection change would feel
 * wrong). RenderEngine.ts has no command-pattern API to hook into — this
 * is a history stack at the React state layer only, replayed through the
 * exact same props (`draft`/`previewDetailModel`) a manual edit already
 * flows through, so undo needs no special-casing anywhere in the render
 * path.
 *
 * All the actual state-transition logic lives in the pure, framework-free
 * `historyReducer` (src/lib/historyReducer.ts) — this hook only adds the
 * debounce timer around dispatching `"set"` with `commit: false`, since a
 * `setTimeout` is an inherently imperative concern a reducer can't own.
 */
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

  // Don't leave a dangling timer if the editor unmounts mid-drag.
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
