import { prisma } from "@/lib/db";
import type { ProjectPublishTarget } from "@/generated/prisma";

export interface TargetResolutionFailure {
  ok: false;
  status: number;
  error: string;
}

export interface TargetResolutionSuccess {
  ok: true;
  target: ProjectPublishTarget;
}

export type TargetResolutionResult = TargetResolutionSuccess | TargetResolutionFailure;

export async function resolvePublishTarget(publicKey: string, request: Request): Promise<TargetResolutionResult> {
  const target = await prisma.projectPublishTarget.findUnique({
    where: { publicKey },
    include: {
      project: { select: { deletedAt: true } },
      publisher: { select: { deletedAt: true } },
    },
  });
  if (!target) {
    return { ok: false, status: 404, error: "Not found." };
  }

  if (target.project.deletedAt || target.publisher.deletedAt) {
    return { ok: false, status: 404, error: "Not found." };
  }

  if (target.status !== "active") {
    return { ok: false, status: 403, error: `This publish target is ${target.status}, not active.` };
  }

  const now = new Date();
  if (target.licenseStartsAt && now < target.licenseStartsAt) {
    return { ok: false, status: 403, error: "This publish target's license has not started yet." };
  }
  if (target.licenseEndsAt && now > target.licenseEndsAt) {
    return { ok: false, status: 403, error: "This publish target's license has expired." };
  }

  if (target.type === "embed" && target.allowedOrigins.length > 0) {
    const origin = request.headers.get("origin");
    if (origin && !target.allowedOrigins.includes(origin)) {
      return { ok: false, status: 403, error: "Origin not permitted for this publish target." };
    }
  }

  return { ok: true, target };
}
