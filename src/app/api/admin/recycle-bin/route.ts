import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { RECYCLE_BIN_ENTITIES, RECYCLE_BIN_ENTITY_TYPES } from "@/lib/adminEntities";

/**
 * Super Admin Recycle Bin — lists every soft-deleted row across the 8
 * configured entity types (`src/lib/adminEntities.ts`). `?type=` narrows
 * to one; omitted returns all, grouped by type, so the panel can show a
 * single combined list with per-row type badges.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const typeFilter = url.searchParams.get("type");
  const types = typeFilter ? [typeFilter] : RECYCLE_BIN_ENTITY_TYPES;

  const results = await Promise.all(
    types.map(async (type) => {
      const config = RECYCLE_BIN_ENTITIES[type as keyof typeof RECYCLE_BIN_ENTITIES];
      if (!config) return { type, items: [] };
      const rows = await config.findMany({ deletedAt: { not: null } });
      return {
        type,
        items: rows.map((row) => ({
          id: row.id,
          label: config.label(row),
          deletedAt: row.deletedAt,
          deletedBy: row.deletedBy,
        })),
      };
    })
  );

  return NextResponse.json(results);
}
