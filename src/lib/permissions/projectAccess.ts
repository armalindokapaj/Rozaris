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
