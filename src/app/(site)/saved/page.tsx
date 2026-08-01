"use client";

import Link from "next/link";
import { Bell, Heart, MapPin } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { listings, projects, neighborhoods } from "@/lib/mockData";
import { ListingCard } from "@/components/results/ListingCard";
import { ProjectCard } from "@/components/results/ProjectCard";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useHasMounted } from "@/hooks/useHasMounted";

export default function SavedPage() {
  const auth = useAppStore((s) => s.auth);
  const signIn = useAppStore((s) => s.signIn);
  const saved = useAppStore((s) => s.saved);
  const savedSearches = useAppStore((s) => s.savedSearches);
  const mounted = useHasMounted();

  if (!mounted) return null;

  if (!auth.signedIn) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <Heart className="h-10 w-10 text-brand-500" />
        <h1 className="text-xl font-bold text-neutral-900">Sign in to view saved items</h1>
        <p className="text-sm text-neutral-500">
          Saving listings, projects, neighborhoods and searches requires a phone-verified account.
        </p>
        <button
          onClick={() => signIn("John Doe")}
          className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Sign in (demo)
        </button>
      </div>
    );
  }

  const savedListings = listings.filter((l) => saved.listings.includes(l.id));
  const savedProjects = projects.filter((p) => saved.projects.includes(p.id));
  const savedNeighborhoods = neighborhoods.filter((n) => saved.neighborhoods.includes(n.id));

  const isEmpty =
    savedListings.length === 0 &&
    savedProjects.length === 0 &&
    savedNeighborhoods.length === 0 &&
    savedSearches.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <h1 className="text-2xl font-bold text-neutral-900">Saved</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Your saved listings, projects, neighborhoods and search alerts.
      </p>

      {isEmpty && (
        <p className="mt-10 rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          Nothing saved yet. Tap the heart icon on any listing or project to save it here.
        </p>
      )}

      {savedSearches.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-bold text-neutral-900">Saved searches</h2>
          <div className="mt-3 space-y-2">
            {savedSearches.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-card border border-neutral-200 bg-white p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{s.name}</p>
                  <p className="text-xs text-neutral-500">{s.filtersSummary || "All properties"}</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium capitalize text-neutral-600">
                  <Bell className="h-3.5 w-3.5" />
                  {s.cadence}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {savedNeighborhoods.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-bold text-neutral-900">Neighborhoods</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {savedNeighborhoods.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2.5 rounded-card border border-neutral-200 bg-white py-2 pl-2 pr-3.5"
              >
                <PlaceholderImage seed={n.id} kind="facade" className="h-9 w-9 rounded-xl" iconClassName="h-4 w-4" />
                <span className="flex items-center gap-1 text-sm font-medium text-neutral-800">
                  <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                  {n.name}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {savedProjects.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-bold text-neutral-900">Projects</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedProjects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}

      {savedListings.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-bold text-neutral-900">Listings</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedListings.map((l) => (
              <ListingCard key={l.id} listing={l} variant="grid" />
            ))}
          </div>
        </section>
      )}

      {!isEmpty && (
        <p className="mt-10 text-center text-xs text-neutral-400">
          Looking for more? <Link href="/" className="text-brand-600 hover:underline">Back to the map</Link>
        </p>
      )}
    </div>
  );
}
