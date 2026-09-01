import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { PAGE_SEO_REGISTRY, type PageSeoKey } from "@/lib/pageSeo";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.pageSeoOverride.findMany();
  const byKey = new Map(rows.map((r) => [r.page, r]));
  const merged = (Object.keys(PAGE_SEO_REGISTRY) as PageSeoKey[]).map((page) => {
    const row = byKey.get(page);
    const fallback = PAGE_SEO_REGISTRY[page];
    return {
      page,
      fallbackTitle: fallback.title,
      fallbackDescription: fallback.description,
      title: row?.title ?? "",
      description: row?.description ?? "",
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
  return NextResponse.json(merged);
}

const bodySchema = z.object({
  page: z.string().min(1),
  title: z.string(),
  description: z.string(),
});

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(parsed.data.page in PAGE_SEO_REGISTRY)) {
    return NextResponse.json({ error: "Unknown page." }, { status: 400 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const title = parsed.data.title.trim();
  const description = parsed.data.description.trim();

  if (!title && !description) {
    await prisma.pageSeoOverride.deleteMany({ where: { page: parsed.data.page } });
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: `SEO override cleared for "${parsed.data.page}"`,
      entityType: "PageSeoOverride",
      entityId: parsed.data.page,
    });
    return NextResponse.json({ page: parsed.data.page, title: "", description: "" });
  }

  const row = await prisma.pageSeoOverride.upsert({
    where: { page: parsed.data.page },
    create: { page: parsed.data.page, title: title || null, description: description || null, updatedBy: actor },
    update: { title: title || null, description: description || null, updatedBy: actor },
  });

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: `SEO override updated for "${parsed.data.page}"`,
    entityType: "PageSeoOverride",
    entityId: parsed.data.page,
    newState: row,
  });

  return NextResponse.json(row);
}
