import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { ProjectMemberRole } from "@/generated/prisma";

export type ProjectPermission =
  | "project:read"
  | "inventory:read"
  | "inventory:update"
  | "leads:read"
  | "analytics:read"
  | "integration:read"
  | "integration:manage";

/**
 * Multi-Channel Publishing PRD Phase 9, §29 "Never give client `admin`" —
 * the conceptual permission set from that section, minus `price:update`
 * (folded into `inventory:update`, since this app's Unit PATCH already
 * treats price as just another field, not a separately-gated one — no
 * existing route makes that distinction and inventing it here would be
 * unused ceremony).
 */
const ROLE_PERMISSIONS: Record<ProjectMemberRole, ProjectPermission[]> = {
  project_admin: [
    "project:read",
    "inventory:read",
    "inventory:update",
    "leads:read",
    "analytics:read",
    "integration:read",
    "integration:manage",
  ],
  inventory_manager: ["project:read", "inventory:read", "inventory:update"],
  sales_manager: ["project:read", "inventory:read", "leads:read"],
  analytics_viewer: ["project:read", "analytics:read"],
};

/**
 * Multi-Channel Publishing PRD Phase 9 — the `/api/client/*` routes' gate,
 * parallel to `requireAdmin()`/`requirePublisherSession()` but scoped to
 * ONE project rather than the whole admin console or the whole Publisher.
 * Precedence, matching PRD §71's "four different questions" framing (this
 * answers only "who can touch this specific project," not project/3D-twin/
 * release validity):
 *
 * 1. A Rozaris admin session always passes (same "admin outranks every
 *    scoped gate" convention as every other gate in this app).
 * 2. The session's own Publisher owns the project, AND that session's
 *    `orgRole` is `owner`/`admin` (full org-wide reach, same as
 *    `requireOrgRole()`) — no `ProjectMembership` row needed.
 * 3. Otherwise, an explicit `ProjectMembership` row for this exact
 *    project+user, checked against that role's permission list above. A
 *    regular org member (`agent`/`content_editor`/`viewer`) of the RIGHT
 *    Publisher but with no membership row for THIS project is refused —
 *    org-wide roles don't imply project-wide reach, that's the entire
 *    point of this table existing.
 */
export async function requireProjectPermission(projectId: string, permission: ProjectPermission) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (session.user.role === "admin") return session;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { publisherId: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (
    session.user.publisherId === project.publisherId &&
    (session.user.orgRole === "owner" || session.user.orgRole === "admin")
  ) {
    return session;
  }

  const membership = await prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId: session.user.id } },
  });
  if (membership && ROLE_PERMISSIONS[membership.role].includes(permission)) {
    return session;
  }

  return NextResponse.json({ error: `Missing project permission "${permission}".` }, { status: 403 });
}
