import type { Metadata } from "next";
import { getAllProjects } from "@/lib/projects.server";
import { NewProjectsClient } from "@/components/project/NewProjectsClient";

export const metadata: Metadata = {
  title: "Projekte të Reja",
  description: "Shfleto të gjitha projektet e reja në zhvillim në ROZARIS, me njësi ende të disponueshme.",
};

export default async function NewProjectsPage() {
  const projects = await getAllProjects();
  return <NewProjectsClient projects={projects} />;
}
