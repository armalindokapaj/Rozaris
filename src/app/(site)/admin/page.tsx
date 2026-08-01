"use client";

import { useState } from "react";
import {
  ShieldCheck,
  ListChecks,
  Users,
  Box,
  BarChart3,
  Check,
  X,
  MessageSquare,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { listings, projects, publishers } from "@/lib/mockData";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { formatPrice, cn } from "@/lib/utils";

const TABS = [
  { id: "queue", label: "Approval queue", icon: ListChecks },
  { id: "publishers", label: "Publishers", icon: Users },
  { id: "content", label: "Listings & Projects", icon: Box },
  { id: "reports", label: "Reports", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface QueueItem {
  id: string;
  title: string;
  type: "Listing" | "Project update" | "Publisher verification";
  submittedBy: string;
}

const seedQueue: QueueItem[] = [
  { id: "q1", title: "Sunlit Corner Apartment — new submission", type: "Listing", submittedBy: "Andi Hoxha" },
  { id: "q2", title: "Marina Residence — Unit B-212 price change", type: "Project update", submittedBy: "ALBA Construction" },
  { id: "q3", title: "Vega Real Estate — verification documents", type: "Publisher verification", submittedBy: "Vega Real Estate" },
  { id: "q4", title: "Don Bosko Heights — construction progress evidence", type: "Project update", submittedBy: "Skyline Developers" },
];

export default function AdminPage() {
  const auth = useAppStore((s) => s.auth);
  const signIn = useAppStore((s) => s.signIn);
  const [tab, setTab] = useState<TabId>("queue");
  const [queue, setQueue] = useState(seedQueue);

  // In this frontend prototype, any signed-in demo account may preview the
  // Admin console — a real deployment gates this behind the Admin role.
  if (!auth.signedIn) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <ShieldCheck className="h-10 w-10 text-brand-500" />
        <h1 className="text-xl font-bold text-neutral-900">Admin sign-in required</h1>
        <button
          onClick={() => signIn("Admin", "admin")}
          className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Sign in as Admin (demo)
        </button>
      </div>
    );
  }

  function decide(id: string) {
    setQueue((q) => q.filter((i) => i.id !== id));
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
      <aside className="shrink-0 lg:w-56">
        <div className="mb-4 flex items-center gap-2 rounded-panel border border-neutral-200 bg-white p-3.5">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <p className="text-sm font-semibold text-neutral-900">Admin console</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto scroll-thin lg:flex-col lg:overflow-visible">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-medium",
                tab === id
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {id === "queue" && queue.length > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {queue.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {tab === "queue" && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900">Approval queue</h1>
              <p className="text-sm text-neutral-500">
                Every listing, project update and publisher verification requires a decision (BR-004).
              </p>
            </div>
            {queue.length === 0 ? (
              <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
                Queue clear — nice work.
              </p>
            ) : (
              <div className="space-y-2.5">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-neutral-200 bg-white p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{item.title}</p>
                      <p className="text-xs text-neutral-500">
                        {item.type} · submitted by {item.submittedBy}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => decide(item.id)}
                        className="flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Request changes
                      </button>
                      <button
                        onClick={() => decide(item.id)}
                        className="flex items-center gap-1.5 rounded-control border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "publishers" && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-neutral-900">Publishers</h1>
            <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Publisher</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {publishers.map((p) => (
                    <tr key={p.id}>
                      <td className="flex items-center gap-2.5 px-4 py-3">
                        <PlaceholderImage
                          seed={p.id}
                          kind="avatar"
                          className="h-8 w-8 rounded-lg"
                          iconClassName="h-3.5 w-3.5"
                        />
                        {p.name}
                      </td>
                      <td className="px-4 py-3 capitalize text-neutral-600">
                        {p.type.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3">
                        {p.verified ? (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                            Verified
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-500">
                            Unverified
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "content" && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-neutral-900">Listings & projects</h1>
            <p className="text-sm text-neutral-500">
              {listings.length} active listings · {projects.length} projects published.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <div key={p.id} className="rounded-card border border-neutral-200 bg-white p-3.5">
                  <p className="text-sm font-semibold text-neutral-900">{p.name}</p>
                  <p className="text-xs text-neutral-500">
                    {p.developer.name} · {formatPrice(Math.min(...p.units.map((u) => u.price)), "EUR", { compact: true })}+
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "reports" && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-neutral-900">Reports</h1>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ReportStat label="Median approval SLA" value="6.2h" />
              <ReportStat label="Content quality" value="100%" />
              <ReportStat label="Duplicate flags (30d)" value="3" />
              <ReportStat label="Platform uptime" value="99.98%" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-4">
      <p className="text-xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}
