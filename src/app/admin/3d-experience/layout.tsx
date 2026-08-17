import { requireAdminPage } from "@/lib/adminAuth";

/**
 * Real server-side gate for `/admin/3d-experience/[projectId]` — see
 * requireAdminPage()'s doc comment. Runs before the client page (or any of
 * its data fetches) ever renders; the page's own client-side `auth.signedIn`
 * check has been removed as redundant now that this exists.
 */
export default async function ThreeDExperienceLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
