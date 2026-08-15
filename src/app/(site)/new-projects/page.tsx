import type { Metadata } from "next";
import { getAllProjects } from "@/lib/projects.server";
import { NewProjectsClient } from "@/components/project/NewProjectsClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("newProjects");
}

export default async function NewProjectsPage() {
  const projects = await getAllProjects();
  return <NewProjectsClient projects={projects} />;
}
