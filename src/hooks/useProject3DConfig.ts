"use client";

import { useEffect, useState } from "react";
import { defaultProject3DConfig } from "@/lib/store";
import { normalizeProject3DConfigRow } from "@/lib/project3DConfig";
import type { Project3DConfig } from "@/lib/types";

export function useProject3DConfig(projectId: string): Project3DConfig {
  const [config, setConfig] = useState<Project3DConfig>(defaultProject3DConfig);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/project-3d-config/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row: Project3DConfig | null) => {
        if (cancelled) return;
        setConfig(normalizeProject3DConfigRow(row));
      })
      .catch(() => {
        if (!cancelled) setConfig(defaultProject3DConfig);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return config;
}
