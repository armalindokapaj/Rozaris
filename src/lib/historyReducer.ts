export interface HistoryState<T> {
  present: T;
  past: T[];
  future: T[];
  hasPending: boolean;
  pendingBaseline: T | null;
}

export type HistoryAction<T> =
  | { type: "set"; updater: T | ((prev: T) => T); commit: boolean }
  | { type: "setSilent"; updater: T | ((prev: T) => T) }
  | { type: "flushPending" }
  | { type: "undo" }
  | { type: "redo" };

export function initialHistoryState<T>(present: T): HistoryState<T> {
  return { present, past: [], future: [], hasPending: false, pendingBaseline: null };
}

function foldPending<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.hasPending) return h;
  return {
    ...h,
    past: [...h.past, h.pendingBaseline as T],
    hasPending: false,
    pendingBaseline: null,
  };
}

export function historyReducer<T>(h: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
  switch (action.type) {
    case "set": {
      const next = typeof action.updater === "function" ? (action.updater as (prev: T) => T)(h.present) : action.updater;
      if (action.commit) {
        const folded = foldPending(h);
        return { present: next, past: [...folded.past, h.present], future: [], hasPending: false, pendingBaseline: null };
      }
      const baseline = h.hasPending ? h.pendingBaseline : h.present;
      return { present: next, past: h.past, future: h.future, hasPending: true, pendingBaseline: baseline };
    }
    case "setSilent": {
      const next = typeof action.updater === "function" ? (action.updater as (prev: T) => T)(h.present) : action.updater;
      return { ...h, present: next };
    }
    case "flushPending":
      return foldPending(h);
    case "undo": {
      const folded = foldPending(h);
      if (folded.past.length === 0) return folded;
      const prevValue = folded.past[folded.past.length - 1];
      return {
        ...folded,
        present: prevValue,
        past: folded.past.slice(0, -1),
        future: [...folded.future, folded.present],
      };
    }
    case "redo": {
      if (h.future.length === 0) return h;
      const nextValue = h.future[h.future.length - 1];
      return { ...h, present: nextValue, past: [...h.past, h.present], future: h.future.slice(0, -1) };
    }
    default:
      return h;
  }
}
