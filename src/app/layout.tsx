import type { Metadata } from "next";
import { Nunito_Sans, Roboto } from "next/font/google";
import "./globals.css";
import { StoreHydration } from "@/components/providers/StoreHydration";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { AuthSessionSync } from "@/components/providers/AuthSessionSync";
import { AccountDataSync } from "@/components/providers/AccountDataSync";
import { CompareOverlay } from "@/components/compare/CompareOverlay";
import { CompareReplaceModal } from "@/components/compare/CompareReplaceModal";
import { SignInModal } from "@/components/layout/SignInModal";
import { SkipLink } from "@/components/common/SkipLink";
import { getPageSeoRaw } from "@/lib/pageSeo";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  display: "swap",
});

// Roboto is reserved for prices, measurements, and tables. Its tabular
// figures make financial information substantially easier to scan.
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Platform CMS's "SEO titles / descriptions" (see src/lib/pageSeo.ts) —
// the site-wide default/fallback title (`template` still applies to every
// page below that doesn't set its own `title`), admin-overridable via the
// "home" key without a deploy.
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getPageSeoRaw("home");
  return {
    title: {
      default: seo.title,
      template: "%s | ROZARIS",
    },
    description: seo.description,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sq" className={`${nunitoSans.variable} ${roboto.variable} h-full antialiased`}>
      <body className="flex h-full min-h-full flex-col bg-background text-foreground">
        <SkipLink />
        <StoreHydration />
        <AuthSessionProvider>
          <AuthSessionSync />
          <AccountDataSync />
          {children}
          <CompareOverlay />
          <CompareReplaceModal />
          <SignInModal />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
