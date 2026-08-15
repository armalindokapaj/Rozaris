import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const MAX_NOTIFICATIONS = 50;

/** Account & Profile System PRD v1.0 §5.3/§13 "Notifications — Alert
 * center" — real `Notification` rows, replacing the buyer dashboard's
 * previous `mockActivity.ts` feed. Producers that create these rows live
 * in `src/lib/notify.ts`. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_NOTIFICATIONS,
  });
  return NextResponse.json(notifications);
}

const bodySchema = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({ markAllRead: z.literal(true) }),
]);

/** Mark one notification read (`{id}`) or every unread one (`{markAllRead:
 * true}`) — both scoped to the signed-in account's own rows only. */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if ("markAllRead" in parsed.data) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  const row = await prisma.notification.findUnique({ where: { id: parsed.data.id } });
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  await prisma.notification.update({ where: { id: row.id }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
