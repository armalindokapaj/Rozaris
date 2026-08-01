"use client";

import { Rotate3d, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useHasMounted } from "@/hooks/useHasMounted";

export function OnboardingHint() {
  const dismissed = useAppStore((s) => s.onboardingDismissed);
  const dismiss = useAppStore((s) => s.dismissOnboarding);
  // Avoid a hydration flash: only decide visibility after the persisted
  // store has rehydrated on the client.
  const mounted = useHasMounted();

  if (!mounted || dismissed) return null;

  return (
    <div
      role="status"
      className="glass-panel pointer-events-auto absolute left-1/2 top-4 z-20 flex w-[min(92vw,380px)] -translate-x-1/2 items-start gap-3 rounded-panel px-4 py-3.5 shadow-lg lg:top-24"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
        <Rotate3d className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900">
          Explore property through the 3D map
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Drag to rotate, pinch or scroll to zoom, and tap any building or project to see
          what&apos;s inside.
        </p>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss onboarding tip"
        className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
