/**
 * Seeds real accounts only — admin, a demo buyer, and the 7 demo
 * publisher orgs (+ their owner Users) from lib/mockData.ts.
 *
 * ⚠️ Used to also seed mockData.ts's `projects` (with units + construction
 * stages) as real rows, back when the public site still browsed
 * mockData.ts directly. That's no longer true — every public/admin surface
 * reads real Postgres now (see the "Rozaris Platform Audit" memory's
 * Projects/Units migration) — and the platform's own real content was
 * explicitly cleared to make room for real listings/projects ("remove all
 * the posts and projects... we will add the real ones... keep only
 * accounts"). Re-adding a project-seeding loop here would silently
 * resurrect demo inventory the next time this script runs. If you need
 * project fixtures for local testing again, create them through the real
 * `/admin/projects/new` flow instead.
 *
 * Idempotent (upsert) — safe to re-run after mockData.ts changes.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma";
import { publishers } from "../src/lib/mockData";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
