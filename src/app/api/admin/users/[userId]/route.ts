import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "restricted", "suspended", "disabled"]).optional(),
  statusReason: z.string().optional(),
  idleDays: z.number().int().min(0).max(365).optional(),
  role: z.enum(["buyer", "publisher", "admin"]).optional(),
  superAdmin: z.boolean().optional(),
  adminScopes: z.array(z.string()).optional(),
  newPassword: z.string().min(4).optional(),
});

const HIGH_RISK_STATUSES = new Set(["suspended", "disabled"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const changesPermissions = parsed.data.superAdmin !== undefined || parsed.data.adminScopes !== undefined;

  const gate = changesPermissions ? await requireSuperAdmin() : await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  if (parsed.data.status && HIGH_RISK_STATUSES.has(parsed.data.status) && !parsed.data.statusReason?.trim()) {
    return NextResponse.json(
      { error: "A reason is required to suspend or disable an account." },
      { status: 400 }
    );
  }

  const { userId } = await params;
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  try {
    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    const { idleDays, newPassword, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (parsed.data.status) {
      data.statusChangedAt = new Date();
      data.statusChangedBy = actor;
      data.statusUntil =
        parsed.data.status === "restricted" && idleDays
          ? new Date(Date.now() + idleDays * 24 * 60 * 60 * 1000)
          : null;
    }
    if (newPassword) {
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.user.update({ where: { id: userId }, data });

    const actions: string[] = [];
    if (parsed.data.name) actions.push("Name updated");
    if (parsed.data.status) {
      actions.push(
        `Account status → ${parsed.data.status}` +
          (parsed.data.status === "restricted" && idleDays ? ` (${idleDays}d)` : "")
      );
    }
    if (parsed.data.role) actions.push(`Role → ${parsed.data.role}`);
    if (parsed.data.superAdmin !== undefined) actions.push(parsed.data.superAdmin ? "Granted Super Admin" : "Revoked Super Admin");
    if (parsed.data.adminScopes) actions.push(`Admin scopes → ${parsed.data.adminScopes.join(", ") || "(none)"}`);
    if (newPassword) actions.push("Password reset by admin");

    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      actorRole: gate.user?.role,
      action: actions.join("; ") || "User updated",
      entityType: "User",
      entityId: userId,
      entityLabel: existing.name,
      reason: parsed.data.statusReason,
      previousState: existing,
      newState: updated,
    });

    return NextResponse.json(updated);
  } catch (err) {
    await logApiError(`/api/admin/users/${userId}`, err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
