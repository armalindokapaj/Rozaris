import type {
  Conversation,
  Listing,
  Neighborhood,
  Project,
  Publisher,
  Unit,
  ConstructionStage,
} from "./types";

export const CITY = "Tirana";
export const CITY_CENTER = { lat: 41.3275, lng: 19.8187 };

export const neighborhoods: Neighborhood[] = [
  {
    id: "n-blloku",
    slug: "blloku",
    name: "Bllok",
    city: CITY,
    coords: { lat: 41.3229, lng: 19.8172 },
    listingCount: 128,
    description:
      "Tirana's most vibrant district — cafés, boutiques and a dense mix of renovated and new-build apartments minutes from the center.",
    essentialPOIs: ["school", "bus_stop", "hospital"],
  },
  {
    id: "n-komuna",
    slug: "komuna-e-parisit",
    name: "Komuna e Parisit",
    city: CITY,
    coords: { lat: 41.3266, lng: 19.8104 },
    listingCount: 96,
    description:
      "A quieter, tree-lined residential pocket close to the university campus, popular with young professionals and families.",
    essentialPOIs: ["university", "bus_stop"],
  },
  {
    id: "n-liqeni",
    slug: "liqeni-i-thate",
    name: "Liqeni i Thatë",
    city: CITY,
    coords: { lat: 41.3336, lng: 19.8262 },
    listingCount: 83,
    description:
      "New-development corridor along the lake park with the highest concentration of ArchViz-ready projects.",
    essentialPOIs: ["school", "hospital"],
  },
  {
    id: "n-donbosko",
    slug: "don-bosko",
    name: "Don Bosko",
    city: CITY,
    coords: { lat: 41.3096, lng: 19.8253 },
    listingCount: 61,
    description:
      "Established family neighborhood with larger floor plans and easy access to the ring road.",
    essentialPOIs: ["school", "bus_stop", "hospital"],
  },
  {
    id: "n-21dhjetori",
    slug: "21-dhjetori",
    name: "21 Dhjetori",
    city: CITY,
    coords: { lat: 41.3312, lng: 19.8341 },
    listingCount: 57,
    description:
      "Central business corridor mixing office towers with premium residential addresses.",
    essentialPOIs: ["bus_stop", "hospital"],
  },
  {
    id: "n-kombinat",
    slug: "kombinat",
    name: "Kombinat",
    city: CITY,
    coords: { lat: 41.3009, lng: 19.7738 },
    listingCount: 44,
    description:
      "Fast-growing suburban edge with the city's largest concentration of new-development land plots.",
    essentialPOIs: ["school", "bus_stop"],
  },
];

const agencyLogo = (letter: string) => letter;

export const publishers: Publisher[] = [
  {
    id: "p-alba",
    slug: "alba-construction",
    name: "ALBA Construction",
    type: "developer",
    verified: true,
    logoUrl: agencyLogo("A"),
    phone: "+355691234567",
    whatsapp: "355691234567",
    bio: "Award-winning residential developer delivering premium mixed-use projects across Tirana since 2011.",
    city: "Tirana, Albania",
    foundedYear: 2011,
    awardsCount: 8,
  },
  {
    id: "p-skyline",
    slug: "skyline-developers",
    name: "Skyline Developers",
    type: "developer",
    verified: true,
    logoUrl: agencyLogo("S"),
    phone: "+355692345678",
    whatsapp: "355692345678",
    bio: "Vertical living specialists focused on the 21 Dhjetori business corridor.",
    city: "Tirana, Albania",
    foundedYear: 2015,
    awardsCount: 3,
  },
  {
    id: "p-lakeside",
    slug: "lakeside-homes",
    name: "Lakeside Homes",
    type: "developer",
    verified: true,
    logoUrl: agencyLogo("L"),
    phone: "+355693456789",
    whatsapp: "355693456789",
    bio: "Boutique developer building low-density residences around the Liqeni i Thatë park corridor.",
    city: "Tirana, Albania",
    foundedYear: 2018,
    awardsCount: 2,
  },
  {
    id: "p-vega",
    slug: "vega-real-estate",
    name: "Vega Real Estate",
    type: "agency",
    verified: true,
    logoUrl: agencyLogo("V"),
    phone: "+355694567890",
    whatsapp: "355694567890",
    bio: "Full-service agency with verified inventory across Bllok and Komuna e Parisit.",
    city: "Tirana, Albania",
    foundedYear: 2013,
    awardsCount: 5,
  },
  {
    id: "p-prime",
    slug: "prime-properties",
    name: "Prime Properties",
    type: "agency",
    verified: true,
    logoUrl: agencyLogo("P"),
    phone: "+355695678901",
    whatsapp: "355695678901",
    city: "Tirana, Albania",
    foundedYear: 2019,
    awardsCount: 1,
  },
  {
    id: "p-elira",
    slug: "elira-gashi",
    name: "Elira Gashi",
    type: "private_owner",
    verified: false,
    phone: "+355696789012",
    whatsapp: "355696789012",
  },
  {
    id: "p-andi",
    slug: "andi-hoxha",
    name: "Andi Hoxha",
    type: "private_owner",
    verified: false,
    phone: "+355697890123",
    whatsapp: "355697890123",
  },
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function jitter(base: number, spread: number, seed: number) {
  return base + (seededRandom(seed) - 0.5) * spread;
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const propertyTypeMix: Listing["propertyType"][] = [
  "apartment",
  "apartment",
  "apartment",
  "house",
  "studio",
  "villa",
  "land",
  "office",
  "commercial",
];

const NO_BEDROOM_TYPES: Listing["propertyType"][] = ["studio", "land", "office", "commercial"];

const listingTitles = [
  "Sunlit Corner Apartment",
  "Modern Family Residence",
  "Renovated City Flat",
  "Panoramic Top-Floor Unit",
  "Quiet Courtyard Home",
  "Contemporary Studio",
  "Garden-Level Duplex",
  "Boulevard-Facing Apartment",
  "Newly Built Residence",
  "Classic Renovated Villa",
  "Compact Investment Flat",
  "Spacious Family Apartment",
];

function buildListing(i: number, neighborhood: Neighborhood): Listing {
  const isRent = i % 3 === 0;
  const type = propertyTypeMix[i % propertyTypeMix.length];
  const bedrooms = NO_BEDROOM_TYPES.includes(type) ? 0 : 1 + (i % 4);
  const area = Math.round(40 + bedrooms * 22 + (i % 5) * 6);
  const landArea = type === "villa" ? Math.round(area * (1.6 + (i % 3) * 0.3)) : undefined;
  const buildingPermit = type === "land" ? i % 2 === 0 : undefined;
  const pricePerSqm = isRent ? 0 : Math.round(jitter(1650, 700, i * 11 + 1));
  const price = isRent
    ? Math.round(jitter(350, 300, i * 11 + 2) + bedrooms * 120)
    : Math.round(pricePerSqm * area);
  const publisher = publishers[i % publishers.length];
  const premium = i % 5 === 0;

  return {
    id: `l-${i}`,
    slug: `${listingTitles[i % listingTitles.length]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}-${i}`,
    title: listingTitles[i % listingTitles.length],
    transaction: isRent ? "rent" : "sale",
    rentSubtype: isRent ? (i % 6 === 0 ? "daily" : "long_term") : undefined,
    propertyType: type,
    price,
    currency: "EUR",
    pricePerSqm: isRent ? undefined : pricePerSqm,
    negotiable: i % 4 === 0,
    area,
    landArea,
    buildingPermit,
    bedrooms,
    bathrooms: type === "land" ? 0 : Math.max(1, Math.round(bedrooms * 0.7)),
    floor: 1 + (i % 8),
    totalFloors: 6 + (i % 5),
    yearBuilt: 1998 + (i % 26),
    condition: (["new", "renovated", "good", "needs_renovation"] as const)[
      i % 4
    ],
    amenities: (
      [
        "elevator",
        "parking",
        "balcony",
        "terrace",
        "furnished",
        "garden",
        "accessibility",
      ] as const
    ).filter((_, idx) => (i + idx) % 3 === 0),
    coords: {
      lat: jitter(neighborhood.coords.lat, 0.012, i * 11 + 3),
      lng: jitter(neighborhood.coords.lng, 0.014, i * 11 + 4),
    },
    neighborhoodId: neighborhood.id,
    city: CITY,
    images: ["a", "b", "c", "d"],
    floorPlanImage: "floorplan",
    facadeImage: i % 4 !== 0 ? "facade" : undefined,
    videoUrl: i % 3 === 0 ? `mock://tour/${i}` : undefined,
    description: {
      en: "A well-proportioned home with strong natural light, close to essential family amenities and public transport. Includes an approved floor plan, facade diagram and interior photography set as required for ROZARIS listing quality standards.",
      sq: "Një banesë e përmasave të mira me dritë natyrale të bollshme, pranë shërbimeve thelbësore familjare dhe transportit publik. Përfshin planimetrinë e miratuar, diagramin e fasadës dhe një set fotografish të brendshme sipas standardeve të cilësisë së listimit në ROZARIS.",
    },
    publisher,
    premium,
    status: "active",
    createdAt: new Date(Date.now() - i * 86400000 * 2.2).toISOString(),
    buildingListingCount: i % 7 === 0 ? 2 + (i % 3) : undefined,
  };
}

export const listings: Listing[] = neighborhoods.flatMap((n, ni) =>
  Array.from({ length: 6 }, (_, i) => buildListing(ni * 6 + i, n))
);

function buildUnits(
  projectId: string,
  buildingNames: string[],
  currency: "EUR",
  basePrice: number,
  count: number
): Unit[] {
  return Array.from({ length: count }, (_, i) => {
    const building = buildingNames[i % buildingNames.length];
    const bedrooms = 1 + (i % 4);
    const area = Math.round(45 + bedrooms * 20 + (i % 4) * 5);
    const statusRoll = i % 5;
    return {
      id: `${projectId}-u-${i}`,
      code: `${building}-${100 + i}`,
      type: i % 9 === 0 ? "commercial" : "residential",
      buildingName: building,
      floor: 1 + (i % 9),
      area,
      bedrooms,
      bathrooms: Math.max(1, Math.round(bedrooms * 0.7)),
      price: Math.round(basePrice + area * jitter(1500, 300, hashSeed(projectId) + i * 7)),
      currency,
      transaction: "sale",
      status: statusRoll === 0 ? "sold" : statusRoll === 1 ? "reserved" : "available",
      images: ["a", "b", "c"],
      floorPlanImage: "floorplan",
      facadeImage: i % 3 !== 0 ? "facade" : undefined,
      videoUrl: i % 4 === 0 ? `mock://tour/${projectId}-${i}` : undefined,
    };
  });
}

export const stageTemplate = (percent: number): ConstructionStage[] => {
  const names = [
    "Site preparation",
    "Excavation",
    "Foundation",
    "Structure",
    "Walls & enclosure",
    "Facade",
    "MEP & interior finishing",
    "Landscaping",
  ];
  return names.map((name, idx) => {
    const stagePercent = ((idx + 1) / names.length) * 100;
    return {
      id: `stage-${idx}`,
      name,
      order: idx,
      status:
        percent >= stagePercent
          ? "done"
          : percent >= stagePercent - 100 / names.length
          ? "active"
          : "upcoming",
      progressPercent: Math.min(
        100,
        Math.max(0, Math.round((percent - idx * (100 / names.length)) * (names.length)))
      ),
      dateLabel: `Q${1 + (idx % 4)} ${2025 + Math.floor(idx / 4)}`,
    };
  });
};

export const projects: Project[] = [
  {
    id: "pr-marina",
    slug: "marina-residence",
    name: "Marina Residence",
    developer: publishers[0],
    status: "under_construction",
    progressPercent: 70,
    coords: { lat: 41.3345, lng: 19.8278 },
    neighborhoodId: "n-liqeni",
    city: CITY,
    setting: "tower",
    propertyType: "apartment",
    availableUnits: 42,
    totalUnits: 96,
    heroImage: "marina",
    gallery: ["a", "b", "c", "d", "e"],
    description: {
      en: "A landmark residential tower on the lake park corridor, combining premium finishes with panoramic city and lake views across two phases.",
      sq: "Një kullë banimi emblematike përgjatë korridorit të parkut të liqenit, që kombinon finiturat premium me pamje panoramike nga qyteti dhe liqeni, në dy faza ndërtimi.",
    },
    buildings: ["A", "B"],
    amenities: ["elevator", "parking", "pool", "garden", "accessibility"],
    premium: true,
    completionLabel: "Q3 2026",
    units: buildUnits("pr-marina", ["A", "B"], "EUR", 90000, 48),
    constructionStages: stageTemplate(70),
  },
  {
    id: "pr-cityview",
    slug: "city-view-residence",
    name: "City View Residence",
    developer: publishers[1],
    status: "under_construction",
    progressPercent: 35,
    coords: { lat: 41.3268, lng: 19.8103 },
    neighborhoodId: "n-komuna",
    city: CITY,
    setting: "tower",
    propertyType: "studio",
    availableUnits: 58,
    totalUnits: 72,
    heroImage: "cityview",
    gallery: ["a", "b", "c", "d"],
    description: {
      en: "Compact-footprint tower with efficient one and two-bedroom units designed for young professionals near the university campus.",
      sq: "Kullë me gjurmë kompakte dhe njësi funksionale me një ose dy dhoma gjumi, të projektuara për profesionistë të rinj pranë kampusit universitar.",
    },
    buildings: ["T1"],
    amenities: ["elevator", "parking", "balcony"],
    premium: false,
    completionLabel: "Q1 2027",
    units: buildUnits("pr-cityview", ["T1"], "EUR", 60000, 36),
    constructionStages: stageTemplate(35),
  },
  {
    id: "pr-luxapt",
    slug: "the-boulevard-luxury",
    name: "The Boulevard Luxury",
    developer: publishers[2],
    status: "under_construction",
    progressPercent: 88,
    coords: { lat: 41.3223, lng: 19.8181 },
    neighborhoodId: "n-blloku",
    city: CITY,
    setting: "tower",
    propertyType: "apartment",
    availableUnits: 12,
    totalUnits: 40,
    heroImage: "boulevard",
    gallery: ["a", "b", "c"],
    description: {
      en: "Near-complete boutique residence in the heart of Bllok with full concierge services and rooftop amenities.",
      sq: "Rezidencë butik pothuajse e përfunduar në zemër të Bllokut, me shërbim concierge të plotë dhe hapësira mikpritëse në tarracën e sipërme.",
    },
    buildings: ["A"],
    amenities: ["elevator", "parking", "terrace", "pool", "accessibility"],
    premium: true,
    completionLabel: "Q4 2025",
    units: buildUnits("pr-luxapt", ["A"], "EUR", 140000, 20),
    constructionStages: stageTemplate(88),
  },
  {
    id: "pr-greenpark",
    slug: "green-park-residences",
    name: "Green Park Residences",
    developer: publishers[0],
    status: "coming_soon",
    progressPercent: 5,
    coords: { lat: 41.3006, lng: 19.7714 },
    neighborhoodId: "n-kombinat",
    city: CITY,
    setting: "residential_complex",
    propertyType: "villa",
    availableUnits: 120,
    totalUnits: 120,
    heroImage: "greenpark",
    gallery: ["a", "b"],
    description: {
      en: "Master-planned low-rise community with private gardens, launching pre-construction reservations this quarter.",
      sq: "Komunitet i planifikuar me ndërtesa të ulëta dhe kopshte private, me rezervime para-ndërtimit që nisin këtë tremujor.",
    },
    buildings: ["A", "B", "C"],
    amenities: ["parking", "garden", "accessibility"],
    premium: false,
    completionLabel: "Q2 2028",
    units: buildUnits("pr-greenpark", ["A", "B", "C"], "EUR", 55000, 60),
    constructionStages: stageTemplate(5),
  },
  {
    id: "pr-donbosko",
    slug: "don-bosko-heights",
    name: "Don Bosko Heights",
    developer: publishers[1],
    status: "under_construction",
    progressPercent: 52,
    coords: { lat: 41.3082, lng: 19.8241 },
    neighborhoodId: "n-donbosko",
    city: CITY,
    setting: "residential_complex",
    propertyType: "villa",
    availableUnits: 30,
    totalUnits: 64,
    heroImage: "donbosko",
    gallery: ["a", "b", "c"],
    description: {
      en: "Family-oriented development with larger three and four-bedroom layouts and dedicated play areas.",
      sq: "Zhvillim i orientuar për familje, me njësi më të mëdha me tre e katër dhoma gjumi dhe hapësira të dedikuara lojërash.",
    },
    buildings: ["A", "B"],
    amenities: ["elevator", "parking", "garden", "balcony"],
    premium: false,
    completionLabel: "Q2 2026",
    units: buildUnits("pr-donbosko", ["A", "B"], "EUR", 70000, 40),
    constructionStages: stageTemplate(52),
  },
  {
    id: "pr-riviera",
    slug: "riviera-bay-residence",
    name: "Riviera Bay Residence",
    developer: publishers[4],
    status: "under_construction",
    progressPercent: 45,
    coords: { lat: 40.4667, lng: 19.4903 },
    neighborhoodId: "n-vlore-riviera",
    city: "Vlorë",
    setting: "beach",
    propertyType: "apartment",
    availableUnits: 54,
    totalUnits: 80,
    heroImage: "riviera",
    gallery: ["a", "b", "c"],
    description: {
      en: "Beachfront residence on the Vlorë riviera with private beach access, sea-view terraces and a resort-style pool deck.",
      sq: "Rezidencë buzë detit në rivierën e Vlorës me akses privat në plazh, tarraca me pamje nga deti dhe pishinë në stil resort.",
    },
    buildings: ["A", "B"],
    amenities: ["elevator", "parking", "pool", "terrace", "accessibility"],
    premium: true,
    completionLabel: "Q2 2026",
    units: buildUnits("pr-riviera", ["A", "B"], "EUR", 75000, 44),
    constructionStages: stageTemplate(45),
  },
  {
    id: "pr-alpine",
    slug: "alpine-ridge-residences",
    name: "Alpine Ridge Residences",
    developer: publishers[0],
    status: "coming_soon",
    progressPercent: 8,
    coords: { lat: 40.6186, lng: 20.7808 },
    neighborhoodId: "n-korce-ridge",
    city: "Korçë",
    setting: "residential_complex",
    propertyType: "villa",
    availableUnits: 36,
    totalUnits: 36,
    heroImage: "alpine",
    gallery: ["a", "b"],
    description: {
      en: "Mountain-view chalet-style residences near Korçë, designed as four-season homes with panoramic ridge views.",
      sq: "Rezidenca në stil shale me pamje nga mali pranë Korçës, të projektuara si shtëpi katërsezonale me pamje panoramike nga kodrat.",
    },
    buildings: ["A"],
    amenities: ["parking", "garden", "balcony"],
    premium: false,
    completionLabel: "Q4 2027",
    units: buildUnits("pr-alpine", ["A"], "EUR", 65000, 20),
    constructionStages: stageTemplate(8),
  },
];

function unitToListing(unit: Unit, project: Project): Listing {
  const seed = hashSeed(`${project.id}-${unit.id}`);
  return {
    id: `unit-${project.id}-${unit.id}`,
    slug: `${project.slug}-${unit.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: `${project.name} — Unit ${unit.code}`,
    transaction: unit.transaction,
    propertyType: project.propertyType,
    price: unit.price,
    currency: unit.currency,
    pricePerSqm: unit.area > 0 ? Math.round(unit.price / unit.area) : undefined,
    negotiable: false,
    area: unit.area,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    floor: unit.floor,
    condition: "new",
    amenities: project.amenities,
    coords: {
      lat: jitter(project.coords.lat, 0.0012, seed),
      lng: jitter(project.coords.lng, 0.0014, seed + 1),
    },
    neighborhoodId: project.neighborhoodId,
    city: project.city,
    images: unit.images,
    floorPlanImage: unit.floorPlanImage,
    facadeImage: unit.facadeImage,
    videoUrl: unit.videoUrl,
    description: project.description,
    publisher: project.developer,
    premium: project.premium,
    status: "active",
    createdAt: "2025-06-01T00:00:00.000Z",
    fromProjectSlug: project.slug,
    fromProjectName: project.name,
  };
}

export const projectUnitListings: Listing[] = projects.flatMap((p) =>
  p.units
    .filter((u) => u.status === "available" && u.type === "residential")
    .map((u) => unitToListing(u, p))
);

export const searchableListings: Listing[] = [...listings, ...projectUnitListings];

export function getListingForUnit(project: Project, unit: Unit): Listing | undefined {
  return projectUnitListings.find((l) => l.id === `unit-${project.id}-${unit.id}`);
}

export function getNeighborhood(id: string): Neighborhood | undefined {
  return neighborhoods.find((n) => n.id === id);
}

export function getListingBySlug(slug: string): Listing | undefined {
  return searchableListings.find((l) => l.slug === slug);
}

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getPublisherBySlug(slug: string): Publisher | undefined {
  return publishers.find((p) => p.slug === slug);
}

export function getPublisherById(id: string): Publisher | undefined {
  return publishers.find((p) => p.id === id);
}

export function relatedListings(listing: Listing, count = 4): Listing[] {
  return searchableListings
    .filter(
      (l) => l.id !== listing.id && l.neighborhoodId === listing.neighborhoodId
    )
    .slice(0, count);
}

export function relatedProjects(project: Project, count = 3): Project[] {
  const sameNeighborhood = projects.filter(
    (p) => p.id !== project.id && p.neighborhoodId === project.neighborhoodId
  );
  if (sameNeighborhood.length >= count) return sameNeighborhood.slice(0, count);
  const sameCity = projects.filter(
    (p) => p.id !== project.id && p.city === project.city && !sameNeighborhood.includes(p)
  );
  return [...sameNeighborhood, ...sameCity].slice(0, count);
}

export function projectsByDeveloper(publisherId: string): Project[] {
  return projects.filter((p) => p.developer.id === publisherId);
}

export function listingsByPublisher(publisherId: string): Listing[] {
  return listings.filter((l) => l.publisher.id === publisherId);
}

export const DEMO_PUBLISHER: Publisher = publishers[0];
export const DEMO_PRIVATE_PUBLISHER: Publisher = getPublisherById("p-andi") ?? publishers[0];
export const DEMO_BUYER_ID = "buyer-demo-1";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const seedConversations: Conversation[] = [
  {
    id: "conv-1",
    buyerId: DEMO_BUYER_ID,
    buyerName: "Andi Hoxha",
    publisherId: publishers[0].id,
    publisherName: publishers[0].name,
    listingTitle: projects[0].name,
    listingSlug: projects[0].slug,
    messages: [
      {
        id: "conv-1-m1",
        senderId: DEMO_BUYER_ID,
        senderName: "Andi Hoxha",
        senderRole: "buyer",
        text: `Hi, is a 2-bedroom unit in ${projects[0].name} still available? Interested in the lake-view side.`,
        createdAt: hoursAgo(30),
      },
      {
        id: "conv-1-m2",
        senderId: publishers[0].id,
        senderName: publishers[0].name,
        senderRole: "publisher",
        text: "Hello! Yes, we have a few 2-bedroom units left in Building A with lake views. Would you like the floor plans?",
        createdAt: hoursAgo(27),
      },
      {
        id: "conv-1-m3",
        senderId: DEMO_BUYER_ID,
        senderName: "Andi Hoxha",
        senderRole: "buyer",
        text: "Yes please, and what's the earliest handover date?",
        createdAt: hoursAgo(26),
      },
      {
        id: "conv-1-m4",
        senderId: publishers[0].id,
        senderName: publishers[0].name,
        senderRole: "publisher",
        text: `We're at ${projects[0].progressPercent}% construction — handover is targeted for ${projects[0].completionLabel}.`,
        createdAt: hoursAgo(25),
      },
    ],
  },
  {
    id: "conv-2",
    buyerId: DEMO_BUYER_ID,
    buyerName: "Andi Hoxha",
    publisherId: publishers[3].id,
    publisherName: publishers[3].name,
    listingTitle: listings[0].title,
    listingSlug: listings[0].slug,
    messages: [
      {
        id: "conv-2-m1",
        senderId: DEMO_BUYER_ID,
        senderName: "Andi Hoxha",
        senderRole: "buyer",
        text: `Hi, is "${listings[0].title}" still on the market? Is the price negotiable?`,
        createdAt: hoursAgo(5),
      },
      {
        id: "conv-2-m2",
        senderId: publishers[3].id,
        senderName: publishers[3].name,
        senderRole: "publisher",
        text: "Hi Andi, yes it's still available. There's some room to negotiate — happy to arrange a viewing this week.",
        createdAt: hoursAgo(4),
      },
    ],
  },
];
