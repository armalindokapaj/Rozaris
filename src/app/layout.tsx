import type { Metadata } from "next";
import { Nunito_Sans, Roboto } from "next/font/google";
import "./globals.css";
import { StoreHydration } from "@/components/providers/StoreHydration";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { CompareOverlay } from "@/components/compare/CompareOverlay";
import { CompareReplaceModal } from "@/components/compare/CompareReplaceModal";
import { SignInModal } from "@/components/layout/SignInModal";
import { SkipLink } from "@/components/common/SkipLink";

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

export const metadata: Metadata = {
  title: {
    default: "ROZARIS — Zbulo Pronën Ndryshe",
    template: "%s | ROZARIS",
  },
  description:
    "ROZARIS është një platformë zbulimi pronash që vendos 3D-në në radhë të parë. Rrotullo qytetin, eksploro zonat dhe zbulo listime të verifikuara dhe zhvillime të reja në Tiranë, Shqipëri.",
};

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
          {children}
          <CompareOverlay />
          <CompareReplaceModal />
          <SignInModal />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
