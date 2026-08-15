/**
 * Seeds the Canonical Location System (Location + LocationAlias) — first
 * slice of the user's 2026-08-15 spec (see MEMORY note
 * "rozaris-controlled-taxonomy-spec"). Builds the real hierarchy
 * Country -> County -> Municipality -> City -> Neighborhood for every
 * location mockData.ts already references, using the SAME ids
 * mockData.neighborhoods uses (`n-blloku`, ...) so existing Listing/Project
 * rows' `neighborhoodId` strings resolve to a real Location with zero
 * drift. Also covers the two project-only neighborhood ids (`n-vlore-riviera`,
 * `n-korce-ridge`) that mockData.ts references but never defines in the
 * `neighborhoods` array.
 *
 * Idempotent — upserts every row, safe to re-run.
 *
 * Run with: npx tsx scripts/seed-locations.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

type Seed = {
  id: string;
  parentId: string | null;
  type: "country" | "county" | "municipality" | "city" | "administrative_unit" | "neighborhood";
  officialName: string;
  slug: string;
  latitude?: number;
  longitude?: number;
  aliases?: string[];
};

const CITY_CENTER = { lat: 41.3275, lng: 19.8187 };

const seeds: Seed[] = [
  { id: "AL", parentId: null, type: "country", officialName: "Albania", slug: "albania", aliases: ["Shqiperi", "Shqipëri", "Shqipëria"] },

  // Tirana branch — matches every Tirana neighborhood mockData.ts hardcodes.
  { id: "AL-TR", parentId: "AL", type: "county", officialName: "Tirana County", slug: "tirana-county" },
  { id: "MUN-TIRANA", parentId: "AL-TR", type: "municipality", officialName: "Tirana Municipality", slug: "tirana-municipality" },
  {
    id: "CITY-TIRANA",
    parentId: "MUN-TIRANA",
    type: "city",
    officialName: "Tirana",
    slug: "tirana",
    latitude: CITY_CENTER.lat,
    longitude: CITY_CENTER.lng,
    aliases: ["Tiran", "Tiranë", "Tirona", "Tirana City", "Tirana Albania"],
  },
  { id: "n-blloku", parentId: "CITY-TIRANA", type: "neighborhood", officialName: "Bllok", slug: "blloku", latitude: 41.3229, longitude: 19.8172, aliases: ["Blloku"] },
  { id: "n-komuna", parentId: "CITY-TIRANA", type: "neighborhood", officialName: "Komuna e Parisit", slug: "komuna-e-parisit", latitude: 41.3266, longitude: 19.8104 },
  { id: "n-liqeni", parentId: "CITY-TIRANA", type: "neighborhood", officialName: "Liqeni i Thatë", slug: "liqeni-i-thate", latitude: 41.3336, longitude: 19.8262, aliases: ["Liqeni i Thate"] },
  { id: "n-donbosko", parentId: "CITY-TIRANA", type: "neighborhood", officialName: "Don Bosko", slug: "don-bosko", latitude: 41.3096, longitude: 19.8253 },
  { id: "n-21dhjetori", parentId: "CITY-TIRANA", type: "neighborhood", officialName: "21 Dhjetori", slug: "21-dhjetori", latitude: 41.3312, longitude: 19.8341 },
  { id: "n-kombinat", parentId: "CITY-TIRANA", type: "neighborhood", officialName: "Kombinat", slug: "kombinat" },

  // Vlorë branch — covers Project "Riviera Bay Residence" (mockData.ts's
  // orphaned `n-vlore-riviera` neighborhoodId, never in the neighborhoods array).
  { id: "AL-VL", parentId: "AL", type: "county", officialName: "Vlorë County", slug: "vlore-county" },
  { id: "MUN-VLORE", parentId: "AL-VL", type: "municipality", officialName: "Vlorë Municipality", slug: "vlore-municipality" },
  { id: "CITY-VLORE", parentId: "MUN-VLORE", type: "city", officialName: "Vlorë", slug: "vlore", aliases: ["Vlore", "Vlora"] },
  { id: "n-vlore-riviera", parentId: "CITY-VLORE", type: "neighborhood", officialName: "Riviera", slug: "vlore-riviera" },

  // Himarë / Dhërmi — from the user's own spec example, not yet referenced
  // by any real row, seeded so the hierarchy is real ahead of need.
  { id: "MUN-HIMARE", parentId: "AL-VL", type: "municipality", officialName: "Himarë Municipality", slug: "himare-municipality" },
  { id: "n-dhermi", parentId: "MUN-HIMARE", type: "neighborhood", officialName: "Dhërmi", slug: "dhermi", aliases: ["Dhermi", "Dhermi Beach", "Dhermi Albania"] },

  // Korçë branch — covers Project "Alpine Ridge Residences" (mockData.ts's
  // orphaned `n-korce-ridge` neighborhoodId).
  { id: "AL-KO", parentId: "AL", type: "county", officialName: "Korçë County", slug: "korce-county" },
  { id: "MUN-KORCE", parentId: "AL-KO", type: "municipality", officialName: "Korçë Municipality", slug: "korce-municipality" },
  { id: "CITY-KORCE", parentId: "MUN-KORCE", type: "city", officialName: "Korçë", slug: "korce", aliases: ["Korce", "Korça"] },
  { id: "n-korce-ridge", parentId: "CITY-KORCE", type: "neighborhood", officialName: "Ridge", slug: "korce-ridge" },
];

async function main() {
  let created = 0;
  let updated = 0;
  let aliasCount = 0;

  // Insert in array order — parents are listed before their children above,
  // and `parentId` is a real FK, so this must run sequentially, not
  // Promise.all'd.
  for (const seed of seeds) {
    const { aliases, ...data } = seed;
    const existing = await prisma.location.findUnique({ where: { id: seed.id } });
    await prisma.location.upsert({
      where: { id: seed.id },
      create: data,
      update: data,
    });
    existing ? updated++ : created++;

    for (const alias of aliases ?? []) {
      await prisma.locationAlias.upsert({
        where: { alias_locationId: { alias, locationId: seed.id } },
        create: { alias, locationId: seed.id },
        update: {},
      });
      aliasCount++;
    }
  }

  console.log(`Locations: ${created} created, ${updated} updated. Aliases upserted: ${aliasCount}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
