"use client";

import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { MODULE_ICONS, NAV_ITEMS, type ActiveModule } from "./types";

type NavId = Exclude<ActiveModule, "none">;

export function ViewerNavigation({
  activeModule,
  onSelect,
  className,
}: {
  activeModule: ActiveModule;
  onSelect: (id: NavId) => void;
  className?: string;
}) {
  const { t } = useT();

  function handleClick(id: NavId) {
    if (id === "explore") {
      if (activeModule !== "explore") onSelect("explore");
    } else if (activeModule === id) {
      onSelect("explore");
    } else {
      onSelect(id);
    }
  }

  return (
    <div className={cn("viewer-glass flex h-[60px] w-full items-stretch gap-1 overflow-hidden rounded-panel px-3.5 sm:px-4 lg:w-fit", className)}>
      {NAV_ITEMS.map((id) => {
        const Icon = MODULE_ICONS[id];
        const isActive = activeModule === id;
        const label = t(`viewer.${id}`);
        return (
          <button
            key={id}
            type="button"
            onClick={() => handleClick(id)}
            aria-label={label}
            aria-pressed={isActive}
            className={cn(
              "relative flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-t-control transition-colors lg:w-24 lg:flex-none",
              isActive ? "bg-brand-500/10 text-brand-400" : "text-white/60 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="whitespace-nowrap text-xs font-medium leading-none">{label}</span>
            {                                                        
                                                                 }
            {isActive && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-400" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
