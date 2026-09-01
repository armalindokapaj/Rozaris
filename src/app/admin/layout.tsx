export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex h-full min-h-0 flex-1 flex-col bg-neutral-50">
      {children}
    </main>
  );
}
