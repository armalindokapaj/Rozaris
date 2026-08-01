import { Header } from "@/components/layout/Header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Header />
      <main id="main-content" className="min-h-0 flex-1">
        {children}
      </main>
    </div>
  );
}
