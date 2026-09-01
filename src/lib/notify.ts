import { prisma } from "@/lib/db";

async function notify(input: {
  userId: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  vars?: Record<string, string>;
  href?: string;
}) {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey,
      ...(input.vars !== undefined ? { vars: input.vars } : {}),
      href: input.href,
    },
  });
}

export async function notifyPriceDrop(listing: {
  id: string;
  slug: string;
  title: string;
  price: number;
  currency: string;
}) {
  const savers = await prisma.savedItem.findMany({
    where: { entityType: "listing", entityId: listing.id },
    select: { userId: true },
  });
  if (savers.length === 0) return;

  const formattedPrice = new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(listing.price);
  await Promise.all(
    savers.map((s) =>
      notify({
        userId: s.userId,
        type: "price_change",
        titleKey: "notif.priceDropTitle",
        bodyKey: "notif.priceDropBody",
        vars: { title: listing.title, price: `${formattedPrice} ${listing.currency}` },
        href: `/listing/${listing.slug}`,
      })
    )
  );
}

export async function notifyAvailabilityChange(listing: { id: string; slug: string; title: string }, status: string) {
  const savers = await prisma.savedItem.findMany({
    where: { entityType: "listing", entityId: listing.id },
    select: { userId: true },
  });
  if (savers.length === 0) return;

  await Promise.all(
    savers.map((s) =>
      notify({
        userId: s.userId,
        type: "listing_availability",
        titleKey: "notif.availabilityChangedTitle",
        bodyKey: "notif.availabilityChangedBody",
        vars: { title: listing.title, status },
        href: `/listing/${listing.slug}`,
      })
    )
  );
}

export async function notifyNewUnit(project: { id: string; slug: string; name: string }) {
  const followers = await prisma.follow.findMany({
    where: { kind: "project", targetId: project.id },
    select: { userId: true },
  });
  if (followers.length === 0) return;

  await Promise.all(
    followers.map((f) =>
      notify({
        userId: f.userId,
        type: "project_update",
        titleKey: "notif.newUnitTitle",
        bodyKey: "notif.newUnitBody",
        vars: { project: project.name },
        href: `/project/${project.slug}`,
      })
    )
  );
}
