/**
 * Admin's own root layout — deliberately outside the `(site)` route group
 * (moved here from `(site)/admin`, same URLs, since route groups don't
 * appear in the URL) so none of `(site)/layout.tsx`'s public-site chrome
 * (`<Header />`'s marketing nav, the impersonation banner meant for
 * *browsing the public site as* an impersonated user) renders around the
 * console. A SaaS admin console gets its own dedicated app shell, not a
 * page embedded inside the marketing site's header/footer.
 *
 * Mirrors the sizing contract `(site)/layout.tsx`'s `<main>` used to
 * provide (`flex h-full min-h-0 flex-1 flex-col`) so the full-page 3D
 * editors nested under here (which size themselves off `h-full`) keep
 * working unchanged. `id="main-content"` keeps the global `<SkipLink />`
 * (mounted once in the true root `layout.tsx`) working here too.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex h-full min-h-0 flex-1 flex-col bg-neutral-50">
      {children}
    </main>
  );
}
