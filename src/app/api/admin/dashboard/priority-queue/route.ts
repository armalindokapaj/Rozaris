import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getMissingBindingsProjects } from "@/lib/admin3dHealth";

const STUCK_DRAFT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type Severity = "critical" | "high" | "medium" | "low";
const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 100, high: 70, medium: 40, low: 20 };

export interface PriorityItem {
  id: string;
  type:
    | "listing_pending"
    | "project_pending"
    | "glb_blocked"
    | "missing_bindings"
    | "stuck_draft"
    | "publisher_unverified";
  severity: Severity;
  title: string;
  subtitle: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  createdAt: string;
  deepLink: string;
  inlineApprove: { entityType: "listing" | "project"; entityId: string } | null;
  blocking: boolean;
  priorityScore: number;
}

function score(severity: Severity, createdAt: Date, opts: { revenueImpact?: boolean; blocking?: boolean }) {
  const ageDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / DAY_MS));
  const ageWeight = Math.min(ageDays, 30);
  const revenueImpactWeight = opts.revenueImpact ? 30 : 0;
  const publishBlockWeight = opts.blocking ? 25 : 0;
  const userReportWeight = 0;
  return SEVERITY_WEIGHT[severity] + ageWeight + revenueImpactWeight + publishBlockWeight + userReportWeight;
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const stuckSince = new Date(Date.now() - STUCK_DRAFT_DAYS * DAY_MS);

  const [
    pendingListings,
    pendingProjects,
    blockedMapModels,
    blockedDetailModels,
    stuckMapDrafts,
    stuckDetailDrafts,
    missingBindingsProjects,
    unverifiedPublishers,
  ] = await Promise.all([
    prisma.listing.findMany({
      where: { status: "pending", deletedAt: null },
      select: { id: true, title: true, createdAt: true, publisher: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
    prisma.project.findMany({
      where: { approvalStatus: "pending", deletedAt: null },
      select: { id: true, name: true, createdAt: true, publisher: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
    prisma.mapModelVersion.findMany({
      where: { validationStatus: "blocked", deletedAt: null },
      select: { id: true, projectId: true, version: true, fileName: true, createdAt: true, project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.detailModelVersion.findMany({
      where: { validationStatus: "blocked", deletedAt: null },
      select: { id: true, projectId: true, version: true, fileName: true, createdAt: true, project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.mapModelVersion.findMany({
      where: { publicationStatus: "draft", deletedAt: null, createdAt: { lt: stuckSince } },
      select: { id: true, projectId: true, version: true, createdAt: true, project: { select: { name: true } } },
      take: 10,
    }),
    prisma.detailModelVersion.findMany({
      where: { publicationStatus: "draft", deletedAt: null, createdAt: { lt: stuckSince } },
      select: { id: true, projectId: true, version: true, createdAt: true, project: { select: { name: true } } },
      take: 10,
    }),
    getMissingBindingsProjects(),
    prisma.publisher.findMany({
      where: { verified: false, restricted: false, deletedAt: null },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 15,
    }),
  ]);

  const items: PriorityItem[] = [];

  for (const l of pendingListings) {
    items.push({
      id: `listing_pending:${l.id}`,
      type: "listing_pending",
      severity: "high",
      title: l.title,
      subtitle: `Listing awaiting approval · ${l.publisher.name}`,
      entityType: "Listing",
      entityId: l.id,
      projectId: null,
      createdAt: l.createdAt.toISOString(),
      deepLink: "/admin?tab=queue",
      inlineApprove: { entityType: "listing", entityId: l.id },
      blocking: true,
      priorityScore: score("high", l.createdAt, { blocking: true }),
    });
  }

  for (const p of pendingProjects) {
    items.push({
      id: `project_pending:${p.id}`,
      type: "project_pending",
      severity: "high",
      title: p.name,
      subtitle: `Project awaiting approval · ${p.publisher.name}`,
      entityType: "Project",
      entityId: p.id,
      projectId: p.id,
      createdAt: p.createdAt.toISOString(),
      deepLink: "/admin?tab=queue",
      inlineApprove: { entityType: "project", entityId: p.id },
      blocking: true,
      priorityScore: score("high", p.createdAt, { blocking: true }),
    });
  }

  for (const m of blockedMapModels) {
    items.push({
      id: `glb_blocked:map:${m.id}`,
      type: "glb_blocked",
      severity: "critical",
      title: `3D Map Control · v${m.version} · ${m.fileName}`,
      subtitle: `Validation failed — ${m.project?.name ?? m.projectId}`,
      entityType: "MapModelVersion",
      entityId: m.id,
      projectId: m.projectId,
      createdAt: m.createdAt.toISOString(),
      deepLink: `/admin/3d-map-control/${m.projectId}`,
      inlineApprove: null,
      blocking: true,
      priorityScore: score("critical", m.createdAt, { revenueImpact: true, blocking: true }),
    });
  }
  for (const d of blockedDetailModels) {
    items.push({
      id: `glb_blocked:detail:${d.id}`,
      type: "glb_blocked",
      severity: "critical",
      title: `3D Experience · v${d.version} · ${d.fileName}`,
      subtitle: `Validation failed — ${d.project?.name ?? d.projectId}`,
      entityType: "DetailModelVersion",
      entityId: d.id,
      projectId: d.projectId,
      createdAt: d.createdAt.toISOString(),
      deepLink: `/admin/3d-experience/${d.projectId}`,
      inlineApprove: null,
      blocking: true,
      priorityScore: score("critical", d.createdAt, { revenueImpact: true, blocking: true }),
    });
  }

  for (const mb of missingBindingsProjects) {
    items.push({
      id: `missing_bindings:${mb.projectId}`,
      type: "missing_bindings",
      severity: "medium",
      title: mb.projectName,
      subtitle: `${mb.linkedUnits} of ${mb.totalUnits} units mapped to the published 3D Experience`,
      entityType: "Project",
      entityId: mb.projectId,
      projectId: mb.projectId,
      createdAt: new Date().toISOString(),
      deepLink: `/admin/3d-experience/${mb.projectId}`,
      inlineApprove: null,
      blocking: false,
      priorityScore: score("medium", new Date(), { revenueImpact: true }),
    });
  }

  for (const m of stuckMapDrafts) {
    items.push({
      id: `stuck_draft:map:${m.id}`,
      type: "stuck_draft",
      severity: "low",
      title: `3D Map Control draft · v${m.version}`,
      subtitle: `${m.project?.name ?? m.projectId} — sitting unpublished ${STUCK_DRAFT_DAYS}+ days`,
      entityType: "MapModelVersion",
      entityId: m.id,
      projectId: m.projectId,
      createdAt: m.createdAt.toISOString(),
      deepLink: `/admin/3d-map-control/${m.projectId}`,
      inlineApprove: null,
      blocking: false,
      priorityScore: score("low", m.createdAt, { revenueImpact: true }),
    });
  }
  for (const d of stuckDetailDrafts) {
    items.push({
      id: `stuck_draft:detail:${d.id}`,
      type: "stuck_draft",
      severity: "low",
      title: `3D Experience draft · v${d.version}`,
      subtitle: `${d.project?.name ?? d.projectId} — sitting unpublished ${STUCK_DRAFT_DAYS}+ days`,
      entityType: "DetailModelVersion",
      entityId: d.id,
      projectId: d.projectId,
      createdAt: d.createdAt.toISOString(),
      deepLink: `/admin/3d-experience/${d.projectId}`,
      inlineApprove: null,
      blocking: false,
      priorityScore: score("low", d.createdAt, { revenueImpact: true }),
    });
  }

  for (const p of unverifiedPublishers) {
    items.push({
      id: `publisher_unverified:${p.id}`,
      type: "publisher_unverified",
      severity: "low",
      title: p.name,
      subtitle: "Publisher awaiting identity verification",
      entityType: "Publisher",
      entityId: p.id,
      projectId: null,
      createdAt: p.createdAt.toISOString(),
      deepLink: "/admin?tab=verification",
      inlineApprove: null,
      blocking: false,
      priorityScore: score("low", p.createdAt, {}),
    });
  }

  items.sort((a, b) => b.priorityScore - a.priorityScore || a.createdAt.localeCompare(b.createdAt));

  return NextResponse.json({ items: items.slice(0, 40), total: items.length });
}
