import { prisma } from "@/lib/db";

/**
 * Platform CMS's "SEO titles / SEO descriptions" (PRD_ROZARIS_Admin §14) —
 * the registry of every page an admin can override, paired with that
 * page's own real hardcoded copy as the fallback. A `PageSeoOverride` row
 * (see prisma/schema.prisma) beats the fallback when present; a page with
 * no row yet just renders exactly what it always has. `key` here must
 * match the `page` primary key the admin route reads/writes and the id
 * each page's own `generateMetadata()` passes to `getPageSeo()`.
 */
export const PAGE_SEO_REGISTRY: Record<string, { title: string; description: string }> = {
  home: {
    title: "ROZARIS — Zbulo Pronën Ndryshe",
    description:
      "ROZARIS është një platformë zbulimi pronash që vendos 3D-në në radhë të parë. Rrotullo qytetin, eksploro zonat dhe zbulo listime të verifikuara dhe zhvillime të reja në Tiranë, Shqipëri.",
  },
  about: {
    title: "About ROZARIS | ROZARIS",
    description:
      "ROZARIS is a 3D-first real estate discovery platform built in Tirana, Albania — explore the city in 3D, walk through new developments, and contact publishers directly.",
  },
  developers: {
    title: "Zhvillues & agjenci të verifikuara",
    description: "Shfleto zhvilluesit dhe agjencitë e verifikuara të pasurive të paluajtshme në ROZARIS.",
  },
  newProjects: {
    title: "Projekte të Reja",
    description: "Shfleto të gjitha projektet e reja në zhvillim në ROZARIS, me njësi ende të disponueshme.",
  },
  rentVsBuy: {
    title: "Rent vs Buy",
    description:
      "Compare the true long-term cost of renting versus buying in Tirana. A transparent, assumption-driven calculator — not financial advice.",
  },
  help: {
    title: "Qendra e ndihmës",
    description: "Përgjigje rreth mënyrës si funksionon ROZARIS, zbulimi 3D dhe si të na kontaktoni.",
  },
  privacy: {
    title: "Privacy Policy | ROZARIS",
    description: "How ROZARIS collects, uses, and protects your information.",
  },
  terms: {
    title: "Terms of Use | ROZARIS",
    description: "The terms governing your use of ROZARIS.",
  },
  mortgageCalculator: {
    title: "Kalkulatori i kredisë",
    description: "Vlerëso pagesën tënde mujore të kredisë për një pronë në Shqipëri.",
  },
  interiorDesign: {
    title: "Dizajn interior — Vega Interiors Studio",
    description: "Pse të zgjedhësh një studio dizajni interior, plus një vlerësues kostosh për projektin ose të gjithë njësinë.",
  },
  redoUnitDesign: {
    title: "Rikrijo dizajnin e njësisë — Vega Interiors Studio",
    description: "Vlerësues kostosh sipas llojit dhe sipërfaqes së njësisë, plus zgjedhje e hapësirave për rikonstruksion.",
  },
};

export type PageSeoKey = keyof typeof PAGE_SEO_REGISTRY;

/** Raw strings — the DB override wins field-by-field (a title-only
 * override still falls back to the real description, not an empty one).
 * Used by the root layout (which builds the `title.default`/`template`
 * pair itself) and the admin editor. Page-level `generateMetadata()`
 * bodies should use `getPageSeo()` below instead. */
export async function getPageSeoRaw(key: PageSeoKey): Promise<{ title: string; description: string }> {
  const fallback = PAGE_SEO_REGISTRY[key];
  const override = await prisma.pageSeoOverride.findUnique({ where: { page: key } }).catch(() => null);
  return {
    title: override?.title?.trim() || fallback.title,
    description: override?.description?.trim() || fallback.description,
  };
}

/** Server-side read for a page's own `generateMetadata()`. `title` is
 * wrapped as `{ absolute }` — every registry/override title here is
 * already a complete "Page Name | ROZARIS" string, so it must bypass the
 * root layout's own `title.template` (`"%s | ROZARIS"`) rather than being
 * run through it a second time, which would render "Page Name | ROZARIS
 * | ROZARIS". A real bug this shape avoids, not a hypothetical one — see
 * the "Rozaris Platform Audit" memory. */
export async function getPageSeo(key: PageSeoKey): Promise<{ title: { absolute: string }; description: string }> {
  const { title, description } = await getPageSeoRaw(key);
  return { title: { absolute: title }, description };
}
