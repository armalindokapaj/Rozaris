import { requireAdminPage } from "@/lib/adminAuth";

export default async function ThreeDMapControlLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
