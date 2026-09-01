"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, ChevronDown, Plus, FolderPlus, ListChecks, Boxes, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import type { AdminSearchResponse, AdminSearchResult } from "@/app/api/admin/search/route";

interface PriorityItem {
  id: string;
  title: string;
  subtitle: string;
}
interface PriorityQueueSummary {
  items: PriorityItem[];
  total: number;
}

export function AdminTopBar({
  onNavigate,
  isSuperAdmin,
}: {
  onNavigate: (tab: string, section?: string, query?: string) => void;
  isSuperAdmin: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResponse | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [priority, setPriority] = useState<PriorityQueueSummary | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard/priority-queue")
      .then((r) => (r.ok ? r.json() : null))
      .then(setPriority);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled) setResults(data);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setNotifOpen(false);
        setQuickOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goResult(r: AdminSearchResult) {
    setSearchOpen(false);
    setQuery("");
    if (r.kind === "route") router.push(r.href);
    else onNavigate(r.tab, undefined, r.query);
  }

  const hasResults = results && (results.projects.length || results.publishers.length || results.users.length);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-end gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:px-8"
    >
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder={t("admin.topbar.searchPlaceholder")}
          className="w-full rounded-control border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-12 text-sm focus:border-brand-400 focus:bg-white focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
          ⌘K
        </kbd>

        {searchOpen && query.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-96 overflow-y-auto scroll-thin rounded-panel border border-neutral-200 bg-white p-2 shadow-[var(--shadow-2)]">
            {!results ? (
              <p className="px-2 py-3 text-xs text-neutral-400">{t("admin.dashboard.loading")}</p>
            ) : !hasResults ? (
              <p className="px-2 py-3 text-xs text-neutral-400">{t("admin.topbar.searchEmpty")}</p>
            ) : (
              <>
                <SearchGroup label={t("admin.tabContent")} items={results.projects} onPick={goResult} />
                <SearchGroup label={t("admin.tabPublishers")} items={results.publishers} onPick={goResult} />
                <SearchGroup label={t("admin.tabUsers")} items={results.users} onPick={goResult} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => {
            setNotifOpen((v) => !v);
            setQuickOpen(false);
          }}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
        >
          <Bell className="h-4 w-4" />
          {priority && priority.total > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {priority.total > 99 ? "99+" : priority.total}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-panel border border-neutral-200 bg-white p-2 shadow-[var(--shadow-2)]">
            <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-neutral-500">{t("admin.topbar.notifTitle")}</p>
            {!priority || priority.items.length === 0 ? (
              <p className="px-2 py-3 text-xs text-neutral-400">{t("admin.dashboard.priorityQueueEmpty")}</p>
            ) : (
              <ul className="space-y-0.5">
                {priority.items.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate("dashboard");
                      }}
                      className="block w-full rounded-control px-2 py-1.5 text-left hover:bg-neutral-50"
                    >
                      <p className="truncate text-xs font-semibold text-neutral-900">{item.title}</p>
                      <p className="truncate text-[11px] text-neutral-400">{item.subtitle}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => {
                setNotifOpen(false);
                onNavigate("dashboard");
              }}
              className="mt-1 w-full rounded-control px-2 py-1.5 text-center text-xs font-semibold text-brand-600 hover:bg-brand-50"
            >
              {t("admin.dashboard.viewAll")}
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => {
            setQuickOpen((v) => !v);
            setNotifOpen(false);
          }}
          className="flex items-center gap-1.5 rounded-control bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-600"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("admin.topbar.quickAction")}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {quickOpen && (
          <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-panel border border-neutral-200 bg-white p-1.5 shadow-[var(--shadow-2)]">
            <QuickActionItem
              icon={FolderPlus}
              label={t("admin.topbar.qaCreateProject")}
              onClick={() => {
                setQuickOpen(false);
                router.push("/admin/projects/new");
              }}
            />
            <QuickActionItem
              icon={ListChecks}
              label={t("admin.topbar.qaApprovalQueue")}
              onClick={() => {
                setQuickOpen(false);
                onNavigate("queue");
              }}
            />
            <QuickActionItem
              icon={Boxes}
              label={t("admin.topbar.qa3DPlatform")}
              onClick={() => {
                setQuickOpen(false);
                onNavigate("experience");
              }}
            />
            {isSuperAdmin && (
              <QuickActionItem
                icon={Trash2}
                label={t("admin.topbar.qaRecycleBin")}
                onClick={() => {
                  setQuickOpen(false);
                  onNavigate("recycleBin");
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchGroup({
  label,
  items,
  onPick,
}: {
  label: string;
  items: AdminSearchResult[];
  onPick: (r: AdminSearchResult) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1.5">
      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      {items.map((r) => (
        <button
          key={r.id}
          onClick={() => onPick(r)}
          className="flex w-full flex-col items-start rounded-control px-2 py-1.5 text-left hover:bg-neutral-50"
        >
          <span className="truncate text-xs font-semibold text-neutral-900">{r.label}</span>
          {r.sublabel && <span className="truncate text-[11px] text-neutral-400">{r.sublabel}</span>}
        </button>
      ))}
    </div>
  );
}

function QuickActionItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
    >
      <Icon className="h-4 w-4 text-neutral-400" />
      {label}
    </button>
  );
}
