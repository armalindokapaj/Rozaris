"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/useT";

/** Generic "fetch one JSON payload, independently loading/erroring/
 * retryable" hook — PRD §16.2/§17.2: a failed widget must show an explicit
 * unavailable state (not zero) and must not block the rest of the page
 * from rendering. Shared by the Dashboard, 3D Health, and Analytics tabs
 * so every card in the console fails the same honest way — a bare
 * `r.ok ? r.json() : null` (no error branch) silently gets stuck on
 * "Loading…" forever instead of surfacing the failure, which is worse
 * than useless when the underlying request 401s.
 *
 * A first-attempt 401 gets exactly one silent auto-retry ~1.2s later
 * before showing the error state — the real admin session
 * (`useAdminSessionRepair`) is established asynchronously right after the
 * mock "Sign in as Admin" click, so the very first render of every
 * `requireAdmin()`-gated card can legitimately race that cookie landing.
 * Confirmed live: without this, every Dashboard card read permanently
 * "Unavailable" on a cold sign-in even though the very same request
 * succeeds a moment later. Not a loop — a second failure is a real error. */
export function useSection<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let retried = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);

    function attempt() {
      fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))
        .then((json) => {
          if (cancelled) return;
          setData(json);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          if (!retried && String(err.message) === "401") {
            retried = true;
            retryTimer = setTimeout(attempt, 1200);
            return;
          }
          setError(true);
          setLoading(false);
        });
    }
    attempt();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [url, reloadKey]);

  return { data, loading, error, reload: () => setReloadKey((k) => k + 1) };
}

export function DashboardCard({
  title,
  action,
  loading,
  error,
  onRetry,
  children,
}: {
  title: string;
  action?: ReactNode;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="flex min-h-[220px] flex-col rounded-panel border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {action}
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-6 text-xs text-neutral-400">
          {t("admin.dashboard.loading")}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center text-xs text-neutral-400">
          <span>{t("admin.dashboard.errorGeneric")}</span>
          <button
            onClick={onRetry}
            className="rounded-control border border-neutral-200 px-2.5 py-1 font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            {t("admin.dashboard.retry")}
          </button>
        </div>
      ) : (
        <div className="flex-1">{children}</div>
      )}
    </div>
  );
}
