import { requireAdminPage } from "@/lib/adminAuth";

export default async function DistributionLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
