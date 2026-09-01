import type { Amenity, Project, ProjectSetting, ProjectStatus, PropertyType } from "@/lib/types";

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

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
