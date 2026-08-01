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
    default: "ROZARIS — Explore Property Differently",
    template: "%s | ROZARIS",
  },
  description:
    "ROZARIS is a 3D-first property discovery platform. Rotate the city, explore neighborhoods and discover verified listings and new developments in Tirana, Albania.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
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
