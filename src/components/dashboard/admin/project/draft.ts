import type { Amenity, Project, ProjectSetting, ProjectStatus, PropertyType } from "@/lib/types";

/**
 * The editable half of a `Project` record, flattened to exactly the shape
 * `POST /api/projects` accepts. The Project Manager holds ONE of these for
 * the whole record view — General, Location, Media and Features all edit
 * the same draft and commit through a single Save, so an admin who
 * renames the project and swaps its hero image doesn't have to remember to
 * press two different save buttons in two different panels (the failure
 * mode of per-panel saves, and the reason the old modal's single
 * bottom-of-the-scroll button existed at all).
 */
export interface ProjectDraft {
  name: string;
  slug: string;
  publisherId: string;
  status: ProjectStatus;
  progressPercent: number;
  neighborhoodId: string;
  city: string;
  lat: number;
  lng: number;
  setting: ProjectSetting;
  propertyType: PropertyType;
  heroImage: string;
  gallery: string[];
  descriptionEn: string;
  descriptionSq: string;
  buildings: string[];
  amenities: Amenity[];
  premium: boolean;
  completionLabel: string;
}

export function draftFromProject(project: Project): ProjectDraft {
  return {
    name: project.name,
    slug: project.slug,
    publisherId: project.developer.id,
    status: project.status,
    progressPercent: project.progressPercent,
    neighborhoodId: project.neighborhoodId,
    city: project.city,
    lat: project.coords.lat,
    lng: project.coords.lng,
    setting: project.setting,
    propertyType: project.propertyType,
    heroImage: project.heroImage,
    gallery: project.gallery,
    descriptionEn: project.description.en,
    descriptionSq: project.description.sq,
    buildings: project.buildings,
    amenities: project.amenities,
    premium: project.premium,
    completionLabel: project.completionLabel,
  };
}

export function draftToPayload(projectId: string, draft: ProjectDraft) {
  return {
    id: projectId,
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    publisherId: draft.publisherId,
    status: draft.status,
    progressPercent: draft.progressPercent,
    lat: draft.lat,
    lng: draft.lng,
    neighborhoodId: draft.neighborhoodId,
    city: draft.city,
    setting: draft.setting,
    propertyType: draft.propertyType,
    heroImage: draft.heroImage,
    gallery: draft.gallery,
    descriptionEn: draft.descriptionEn,
    descriptionSq: draft.descriptionSq,
    buildings: draft.buildings,
    amenities: draft.amenities,
    premium: draft.premium,
    completionLabel: draft.completionLabel,
  };
}

/** Field-by-field, so the save bar can say WHAT is unsaved rather than
 * just that something is — and so a re-render with an identical draft
 * doesn't arm the "you have unsaved changes" guard. */
export function draftDiff(a: ProjectDraft, b: ProjectDraft): (keyof ProjectDraft)[] {
  return (Object.keys(a) as (keyof ProjectDraft)[]).filter((key) => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length !== right.length || left.some((v, i) => v !== right[i]);
    }
    return left !== right;
  });
}

/** URL-safe slug from a project name — the same shape the create flows
 * produce, offered as a one-click "regenerate" next to the slug field
 * rather than silently rewriting it on every rename (an existing project's
 * slug is a live public URL). */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
