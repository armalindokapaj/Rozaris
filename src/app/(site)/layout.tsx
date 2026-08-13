import { Header } from "@/components/layout/Header";
import { ImpersonationBanner } from "@/components/dashboard/admin/superadmin/ImpersonationBanner";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ImpersonationBanner />
      <Header />
      <main id="main-content" className="min-h-0 flex-1">
        {children}
      </main>
    </div>
  );
}
