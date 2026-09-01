"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/useT";

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
