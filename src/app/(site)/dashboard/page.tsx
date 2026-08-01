"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bell,
  Building2,
  Camera,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  User,
  Plus,
  Upload,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { listingsByPublisher, projectsByDeveloper, publishers } from "@/lib/mockData";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { formatPrice, cn } from "@/lib/utils";

const DEMO_PUBLISHER = publishers[0]; // ALBA Construction — demo account

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "listings", label: "Listings", icon: ListChecks },
  { id: "projects", label: "Projects & Units", icon: Building2 },
  { id: "media", label: "Media & Models", icon: Camera },
  { id: "billing", label: "Billing & Premium", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "profile", label: "Profile", icon: User },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function DashboardPage() {
  const auth = useAppStore((s) => s.auth);
  const signIn = useAppStore((s) => s.signIn);
  const [tab, setTab] = useState<TabId>("overview");

  const myListings = listingsByPublisher(DEMO_PUBLISHER.id);
  const myProjects = projectsByDeveloper(DEMO_PUBLISHER.id);

  if (!auth.signedIn) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-xl font-bold text-neutral-900">Sign in to access your dashboard</h1>
        <p className="text-sm text-neutral-500">
          Publisher accounts manage listings, projects and premium purchases here.
        </p>
        <button
          onClick={() => signIn("John Doe", "publisher")}
          className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Sign in (demo)
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
      <aside className="shrink-0 lg:w-56">
        <div className="mb-4 flex items-center gap-3 rounded-panel border border-neutral-200 bg-white p-3.5">
          <PlaceholderImage
            seed={DEMO_PUBLISHER.id}
            kind="avatar"
            className="h-10 w-10 rounded-xl"
            iconClassName="h-4 w-4"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">
              {DEMO_PUBLISHER.name}
            </p>
            <p className="text-xs text-neutral-500">Developer · Verified</p>
          </div>
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
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {tab === "overview" && <OverviewTab listingCount={myListings.length} projectCount={myProjects.length} />}
        {tab === "listings" && <ListingsTab listings={myListings} />}
        {tab === "projects" && <ProjectsTab projects={myProjects} />}
        {tab === "media" && <MediaTab />}
        {tab === "billing" && <BillingTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "profile" && <ProfileTab />}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
}) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-4">
      <Icon className="h-4.5 w-4.5 text-brand-500" />
      <p className="mt-2 text-xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function OverviewTab({
  listingCount,
  projectCount,
}: {
  listingCount: number;
  projectCount: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Overview</h1>
        <p className="text-sm text-neutral-500">Your publishing activity at a glance.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Drafts" value={2} icon={Clock} />
        <StatCard label="Pending review" value={1} icon={MessageSquareWarning} />
        <StatCard label="Published" value={listingCount + projectCount} icon={CheckCircle2} />
        <StatCard label="Changes requested" value={1} icon={XCircle} />
        <StatCard label="Expired" value={0} icon={Clock} />
        <StatCard label="Lead clicks (30d)" value={57} icon={Eye} />
      </div>
      <div className="rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold text-neutral-900">Recent submissions</h2>
        <ul className="mt-3 divide-y divide-neutral-100">
          {[
            ["Marina Residence — Unit A-104 price update", "Approved", "text-green-600"],
            ["City View Residence — availability import (36 rows)", "Approved", "text-green-600"],
            ["Boulevard Luxury — facade photo replacement", "Changes requested", "text-amber-600"],
          ].map(([title, status, color]) => (
            <li key={title} className="flex items-center justify-between py-3 text-sm">
              <span className="text-neutral-700">{title}</span>
              <span className={cn("font-semibold", color)}>{status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ListingsTab({ listings }: { listings: ReturnType<typeof listingsByPublisher> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Listings</h1>
          <p className="text-sm text-neutral-500">Manage your published inventory.</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-control bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> New listing
        </button>
      </div>
      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Listing</th>
              <th className="px-4 py-2.5 font-medium">Price</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {listings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  No listings yet.
                </td>
              </tr>
            )}
            {listings.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3">
                  <Link href={`/listing/${l.slug}`} className="font-medium text-neutral-800 hover:text-brand-600">
                    {l.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{formatPrice(l.price, l.currency)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                    Published
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs font-semibold text-brand-600 hover:underline">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTab({ projects }: { projects: ReturnType<typeof projectsByDeveloper> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Projects & units</h1>
          <p className="text-sm text-neutral-500">Manage inventory, pricing and availability.</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700">
          <Upload className="h-4 w-4" /> Bulk CSV import
        </button>
      </div>
      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.id} className="rounded-panel border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-neutral-900">{p.name}</p>
              <Link
                href={`/project/${p.slug}`}
                target="_blank"
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                View 3D →
              </Link>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {p.availableUnits} available / {p.totalUnits} total units ·{" "}
              {p.progressPercent}% construction complete
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-listing-new-dev"
                style={{ width: `${p.progressPercent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaTab() {
  return (
    <div className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center">
      <Camera className="mx-auto h-8 w-8 text-neutral-300" />
      <p className="mt-3 text-sm font-semibold text-neutral-700">
        Drag & drop plans, photos or 3D model files
      </p>
      <p className="mt-1 text-xs text-neutral-400">
        Accepted: Revit, IFC, FBX, OBJ, GLB/glTF, images, PDF (Section 10.1)
      </p>
      <button className="mt-4 rounded-control bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
        Choose files
      </button>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-neutral-900">Billing & premium</h1>
      <div className="rounded-panel border border-neutral-200 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-900">Developer subscription — Growth plan</p>
        <p className="mt-1 text-xs text-neutral-500">Renews on the 1st of every month · €149/mo</p>
        <div className="mt-4 flex gap-2">
          <button className="rounded-control bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white">
            Manage plan
          </button>
          <button className="rounded-control border border-neutral-200 px-3.5 py-2 text-xs font-semibold text-neutral-700">
            View invoices
          </button>
        </div>
      </div>
      <div className="rounded-panel border border-neutral-200 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-900">Active premium promotions</p>
        <p className="mt-2 text-xs text-neutral-500">Boulevard Luxury — Premium Project · expires in 12 days</p>
      </div>
    </div>
  );
}

function NotificationsTab() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-neutral-900">Notifications</h1>
      <div className="divide-y divide-neutral-100 rounded-panel border border-neutral-200 bg-white">
        {[
          "Admin approved your price update for Marina Residence — Unit A-104.",
          "Changes requested on Boulevard Luxury facade photo — see feedback.",
          "Your Premium Project promotion expires in 12 days.",
        ].map((msg) => (
          <p key={msg} className="px-4 py-3 text-sm text-neutral-700">
            {msg}
          </p>
        ))}
      </div>
    </div>
  );
}

function ProfileTab() {
  return (
    <div id="profile" className="space-y-4">
      <h1 className="text-xl font-bold text-neutral-900">Profile & contact settings</h1>
      <div className="grid grid-cols-1 gap-4 rounded-panel border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <Field label="Display name" defaultValue={DEMO_PUBLISHER.name} />
        <Field label="Phone" defaultValue={DEMO_PUBLISHER.phone} />
        <Field label="WhatsApp" defaultValue={DEMO_PUBLISHER.whatsapp} />
        <Field label="Publisher type" defaultValue="Developer" disabled />
      </div>
      <button className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white">
        Save changes
      </button>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  disabled,
}: {
  label: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      <input
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-400"
      />
    </label>
  );
}
