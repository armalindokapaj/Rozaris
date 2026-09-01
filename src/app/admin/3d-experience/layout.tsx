import { requireAdminPage } from "@/lib/adminAuth";

export default async function ThreeDExperienceLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
