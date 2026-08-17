import { requireAdminPage } from "@/lib/adminAuth";

/**
 * Real server-side gate for `/admin/projects/*` — currently only
 * `projects/new`, see requireAdminPage()'s doc comment. Runs before the
 * client page (or any of its data fetches) ever renders; any future
 * `/admin/projects/*` route inherits this for free. `projects/new/page.tsx`'s
 * own client-side `auth.signedIn` check has been removed as redundant now
 * that this exists.
 */
export default async function AdminProjectsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
