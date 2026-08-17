import { requireAdminPage } from "@/lib/adminAuth";

/**
 * Real server-side gate for `/admin/distribution/[projectId]` — same
 * pattern as the other full-page admin editors' layouts (`3d-experience`,
 * `3d-map-control`, `projects`), added alongside this route rather than
 * retrofitted after the fact. See `requireAdminPage()`'s doc comment.
 */
export default async function DistributionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
