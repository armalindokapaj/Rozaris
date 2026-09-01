import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

type Seed = {
  id: string;
  parentId: string | null;
  type: "municipality" | "city" | "village" | "neighborhood";
  officialName: string;
  slug: string;
  latitude?: number;
  longitude?: number;
  aliases?: string[];
};

const CITY_CENTER = { lat: 41.3275, lng: 19.8187 };

const seeds: Seed[] = [
  { id: "MUN-TIRANA", parentId: null, type: "municipality", officialName: "Tirana Municipality", slug: "tirana-municipality" },
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

  { id: "MUN-VLORE", parentId: null, type: "municipality", officialName: "Vlorë Municipality", slug: "vlore-municipality" },
  { id: "CITY-VLORE", parentId: "MUN-VLORE", type: "city", officialName: "Vlorë", slug: "vlore", aliases: ["Vlore", "Vlora"] },
  { id: "n-vlore-riviera", parentId: "CITY-VLORE", type: "neighborhood", officialName: "Riviera", slug: "vlore-riviera" },

  { id: "MUN-HIMARE", parentId: null, type: "municipality", officialName: "Himarë Municipality", slug: "himare-municipality" },
  { id: "n-dhermi", parentId: "MUN-HIMARE", type: "neighborhood", officialName: "Dhërmi", slug: "dhermi", aliases: ["Dhermi", "Dhermi Beach", "Dhermi Albania"] },

  { id: "MUN-KORCE", parentId: null, type: "municipality", officialName: "Korçë Municipality", slug: "korce-municipality" },
  { id: "CITY-KORCE", parentId: "MUN-KORCE", type: "city", officialName: "Korçë", slug: "korce", aliases: ["Korce", "Korça"] },
  { id: "n-korce-ridge", parentId: "CITY-KORCE", type: "neighborhood", officialName: "Ridge", slug: "korce-ridge" },
];

async function main() {
  let created = 0;
  let updated = 0;
  let aliasCount = 0;

  for (const seed of seeds) {
    const { aliases, ...data } = seed;
    const existing = await prisma.location.findUnique({ where: { id: seed.id } });
    await prisma.location.upsert({
      where: { id: seed.id },
      create: data,
      update: data,
    });
    if (existing) updated++;
    else created++;

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
