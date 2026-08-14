/**
 * Seeds the demo publishers + projects (lib/mockData.ts) into Postgres as
 * real rows, keyed by the SAME ids the mock data already uses (e.g.
 * "pr-marina"). This does NOT change how the site browses/searches
 * projects — that still reads mockData.ts directly (deliberately deferred,
 * see the "rozaris-backend-plan" memory). The only reason these rows need
 * to exist for real is that `ProjectMapModel`/`Project3DConfig` have a
 * foreign key to `Project.id` — Admin can't attach a real, shared GLB to a
 * project that only exists as a JS object in the client bundle.
 *
 * Idempotent (upsert) — safe to re-run after mockData.ts changes.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma";
import { publishers, projects } from "../src/lib/mockData";

const prisma = new PrismaClient();

/** One real admin credential (PRD_Admin_Mapbox_GLB / PRD_Admin_3D_Project_Experience
 * "server-side permission checks protect all write operations") — password
 * "1", matching the existing demo-account convention in
 * src/lib/demoAccounts.ts. Clearly prototype-only; a real launch needs a
 * real credential-issuing flow, not a seeded password. Everything else in
 * the admin UI still gates on the Zustand mock (unchanged) — this is only
 * so the new versioned-3D write routes have a real session to check.
 *
 * `superAdmin: true` (Super Admin control/audit pass) — this is the one
 * real admin account in the whole app, so it gets every capability
 * (hard delete, permission management, impersonation, force publish)
 * immediately rather than needing a second admin to grant them. */
async function seedAdmin() {
  const passwordHash = await bcrypt.hash("1", 10);
  await prisma.user.upsert({
    where: { email: "admin@rozaris.demo" },
    update: { passwordHash, role: "admin", name: "Admin", superAdmin: true, status: "active" },
    create: {
      email: "admin@rozaris.demo",
      name: "Admin",
      role: "admin",
      passwordHash,
      superAdmin: true,
      status: "active",
    },
  });
  console.log("Seeded admin@rozaris.demo (password: 1, superAdmin: true).");
}

/** One real buyer credential, same "password 1" convention as
 * `seedAdmin()`/the publisher owners below — real auth to UI pass (see the
 * "Rozaris Platform Audit" memory). Lets the existing "Elira Krasniqi"
 * demo-account button in SignInModal/JoinMenu keep working once those
 * switch from the client-only mock to a real `signIn("credentials", ...)`
 * call, instead of only publisher/admin personas being real. */
async function seedBuyer() {
  const passwordHash = await bcrypt.hash("1", 10);
  await prisma.user.upsert({
    where: { email: "buyer@seed.rozaris.demo" },
    update: { passwordHash, role: "buyer", name: "Elira Krasniqi", status: "active" },
    create: {
      email: "buyer@seed.rozaris.demo",
      name: "Elira Krasniqi",
      role: "buyer",
      passwordHash,
      status: "active",
    },
  });
  console.log("Seeded buyer@seed.rozaris.demo (password: 1).");
}

async function main() {
  await seedAdmin();
  await seedBuyer();

  // Same "password 1" convention as seedAdmin() above — every seeded
  // publisher owner can now sign in for real (previously only the admin
  // account had a passwordHash; Credentials' authorize() requires one, so
  // these Users existed but could never actually sign in until this pass).
  const publisherPasswordHash = await bcrypt.hash("1", 10);

  for (const p of publishers) {
    const ownerEmail = `${p.slug}@seed.rozaris.demo`;
    const owner = await prisma.user.upsert({
      where: { email: ownerEmail },
      update: { name: p.name, passwordHash: publisherPasswordHash, status: "active" },
      create: {
        email: ownerEmail,
        name: p.name,
        role: "publisher",
        passwordHash: publisherPasswordHash,
        status: "active",
      },
    });

    await prisma.publisher.upsert({
      where: { id: p.id },
      update: {
        slug: p.slug,
        name: p.name,
        type: p.type as "private_owner" | "agency" | "developer",
        verified: p.verified,
        logoUrl: p.logoUrl,
        phone: p.phone,
        whatsapp: p.whatsapp,
        bio: p.bio,
      },
      create: {
        id: p.id,
        slug: p.slug,
        name: p.name,
        type: p.type as "private_owner" | "agency" | "developer",
        verified: p.verified,
        logoUrl: p.logoUrl,
        phone: p.phone,
        whatsapp: p.whatsapp,
        bio: p.bio,
        ownerUserId: owner.id,
      },
    });
  }
  console.log(`Seeded ${publishers.length} publishers.`);

  for (const proj of projects) {
    await prisma.project.upsert({
      where: { id: proj.id },
      update: {
        slug: proj.slug,
        name: proj.name,
        status: proj.status,
        approvalStatus: "active",
        progressPercent: proj.progressPercent,
        lat: proj.coords.lat,
        lng: proj.coords.lng,
        neighborhoodId: proj.neighborhoodId,
        city: proj.city,
        setting: proj.setting,
        propertyType: proj.propertyType,
        heroImage: proj.heroImage,
        gallery: proj.gallery,
        descriptionEn: proj.description.en,
        descriptionSq: proj.description.sq,
        buildings: proj.buildings,
        amenities: proj.amenities,
        premium: proj.premium,
        completionLabel: proj.completionLabel,
      },
      create: {
        id: proj.id,
        slug: proj.slug,
        name: proj.name,
        status: proj.status,
        approvalStatus: "active",
        progressPercent: proj.progressPercent,
        lat: proj.coords.lat,
        lng: proj.coords.lng,
        neighborhoodId: proj.neighborhoodId,
        city: proj.city,
        setting: proj.setting,
        propertyType: proj.propertyType,
        heroImage: proj.heroImage,
        gallery: proj.gallery,
        descriptionEn: proj.description.en,
        descriptionSq: proj.description.sq,
        buildings: proj.buildings,
        amenities: proj.amenities,
        premium: proj.premium,
        completionLabel: proj.completionLabel,
        publisherId: proj.developer.id,
      },
    });

    // Units/stages are re-derived from mockData every run — simplest to
    // just replace them rather than diff, since mockData is the source of
    // truth for these two (never edited via the DB directly today).
    await prisma.unit.deleteMany({ where: { projectId: proj.id } });
    await prisma.unit.createMany({
      data: proj.units.map((u) => ({
        id: u.id,
        code: u.code,
        type: u.type,
        buildingName: u.buildingName,
        floor: u.floor,
        area: u.area,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        price: u.price,
        currency: u.currency,
        transaction: u.transaction,
        status: u.status,
        images: u.images,
        floorPlanImage: u.floorPlanImage,
        facadeImage: u.facadeImage,
        videoUrl: u.videoUrl,
        projectId: proj.id,
      })),
    });

    await prisma.constructionStage.deleteMany({ where: { projectId: proj.id } });
    await prisma.constructionStage.createMany({
      data: proj.constructionStages.map((s) => ({
        // mockData's stage ids ("stage-0".."stage-7") repeat across every
        // project — namespace by project id so they're actually unique here.
        id: `${proj.id}-${s.id}`,
        name: s.name,
        order: s.order,
        status: s.status,
        progressPercent: s.progressPercent,
        dateLabel: s.dateLabel,
        projectId: proj.id,
      })),
    });
  }
  console.log(`Seeded ${projects.length} projects (with units + construction stages).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
