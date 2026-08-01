import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { StoreHydration } from "@/components/providers/StoreHydration";
import { CompareOverlay } from "@/components/compare/CompareOverlay";
import { CompareReplaceModal } from "@/components/compare/CompareReplaceModal";
import { SkipLink } from "@/components/common/SkipLink";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
    <html lang="sq" className={`${inter.variable} h-full antialiased`}>
      <body className="flex h-full min-h-full flex-col bg-background text-foreground">
        <SkipLink />
        <StoreHydration />
        {children}
        <CompareOverlay />
        <CompareReplaceModal />
      </body>
    </html>
  );
}
