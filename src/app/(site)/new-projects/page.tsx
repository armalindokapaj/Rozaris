import type { Metadata } from "next";
import { projects } from "@/lib/mockData";
import { NewProjectsClient } from "@/components/project/NewProjectsClient";

export const metadata: Metadata = {
  title: "Projekte të Reja",
  description: "Shfleto të gjitha projektet e reja në zhvillim në ROZARIS, me njësi ende të disponueshme.",
};

export default function NewProjectsPage() {
  return <NewProjectsClient projects={projects} />;
}
