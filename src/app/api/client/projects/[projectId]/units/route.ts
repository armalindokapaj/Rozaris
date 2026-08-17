import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions/projectAccess";

/**
 * Multi-Channel Publishing PRD Phase 9 — the client portal's Inventory
 * tab (§26). Real `requireProjectPermission()` gate, not
 * `requireAdmin()`/`requirePublisherSession()` — a Sales Agent with only a
 * `ProjectMembership` row (no org-wide role, wouldn't pass
 * `requirePublisherSession` + Publisher ownership checks alone) can reach
 * this. Returns full Unit rows (not the narrow public DTO
 * `lib/viewer/inventoryDto.ts` uses) — this caller legitimately manages
 * their own inventory, unlike an anonymous public viewer.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const gate = await requireProjectPermission(projectId, "inventory:read");
  if (gate instanceof NextResponse) return gate;

  const units = await prisma.unit.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(units);
}
