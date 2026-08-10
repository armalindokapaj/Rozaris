import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Public read of every project's "3D Map Control" placement record — this is
 * what replaced the Zustand-only `projectMapModels` (see MapView.tsx,
 * admin/page.tsx's MapControlTab). Anyone can read (the enabled ones are
 * shown on the public map anyway); only the [projectId] route below writes,
 * and that one still needs the admin-auth check flagged in its file header.
 */
export async function GET() {
  const models = await prisma.projectMapModel.findMany();
  return NextResponse.json(models);
}
