import { requireAdminPage } from "@/lib/adminAuth";

export default async function AdminProjectsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
