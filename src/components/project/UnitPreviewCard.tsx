"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  Bath,
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Heart,
  Home,
  Layers,
  Minimize2,
  Palette,
  Ruler,
  SquareStack,
  X,
} from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { PublisherCard } from "@/components/listing/PublisherCard";
import { useAppStore } from "@/lib/store";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/constants";
import {
  DOCK_HEIGHT_DESKTOP,
  DOCK_HEIGHT_MOBILE_STANDARD,
} from "@/components/project/viewer-hud/layoutState";
import type { Project, Unit, UnitOrientation } from "@/lib/types";

const STATUS_LABEL_KEY: Record<Unit["status"], string> = {
  available: "unit.statusAvailable",
  reserved: "unit.statusReserved",
  sold: "unit.statusSold",
};

const TYPE_LABEL_KEY: Record<Unit["type"], string> = {
  residential: "unit.typeResidential",
  commercial: "unit.typeCommercial",
  parking: "unit.typeParking",
  storage: "unit.typeStorage",
};

const ORIENTATION_LABEL_KEY: Record<UnitOrientation, string> = {
  N: "unit.orientationN",
  E: "unit.orientationE",
  S: "unit.orientationS",
  W: "unit.orientationW",
};

/** Both states are laid out at a fixed pixel width of their own so each one's
 * height can be measured independently of whatever width the shell happens to
 * be mid-morph — measuring a pane while the container is between the two
 * widths would reflow its text and report a height that's wrong the instant
 * the tween lands.
 *
 * The preview is deliberately narrower below `sm` (direct design feedback,
 * 2026-08-24: "make it smaller, more premium") — 288px is over 70% of a 390px
 * phone viewport, which reads as a sheet covering the project rather than a
 * light annotation floating over it. */
const COMPACT_WIDTH_MOBILE = 256;
const COMPACT_WIDTH_DESKTOP = 288;
const EXPANDED_WIDTH = 384;

/** The viewer chrome's own edge inset, not a number of this card's own:
 * ViewerHUD's `<header>` is `p-3 pt-[max(0.75rem,env(safe-area-inset-top))]
 * … sm:p-4`, and the bottom dock strip mirrors it exactly. Used for the
 * card's own max width/height budget; the anchoring itself is pure CSS
 * below so it can pick up `env(safe-area-inset-*)` too. */
const CHROME_GUTTER_MOBILE = 12;
const CHROME_GUTTER_DESKTOP = 16;

const PHOTO_COUNT = 3;

/**
 * The unit card shown when a unit is clicked in the 3D viewer, in both of its
 * states: the small preview, and the expanded detail state behind "View Unit".
 *
 * Deliberately not a full-screen modal in either state: no backdrop, so the
 * scene stays interactive and clicking a *different* unit just swaps this
 * card's content in place (ProjectViewerRuntime re-points `selectedUnit`, no
 * explicit close needed first).
 *
 * "View Unit" used to escalate to `UnitDetailPanel`, a centred 2xl modal with
 * a dimmed backdrop — visually a different object appearing from nowhere,
 * which is exactly what the 2026-08-24 design note rejected ("not the current
 * large and not premium"). It now escalates *in place* instead: one shell that
 * morphs from the preview's 288px box to a 384px detail box, cross-fading the
 * two content panes inside it. Because both panes are pinned to the shell's
 * top-right corner and share the same header geometry (floor · code, price,
 * spec row), the eye reads one card growing rather than two cards swapping —
 * the Material "container transform" pattern, driven by GSAP like every other
 * real animation in the viewer (and honouring the same `useEffectiveReduced-
 * Motion` settings toggle they do).
 */
export function UnitPreviewCard({
  project,
  unit,
  expanded,
  floorSectionName,
  floorSectionActive,
  onViewInFloor,
  onClose,
  onExpand,
  onCollapse,
}: {
  project: Project;
  unit: Unit;
  /** Detail state — driven by ProjectViewerRuntime's `fullDetailOpen`. */
  expanded: boolean;
  /** The name of the Section that cuts this unit's floor open, or null if
   * this project has none for it — see `src/lib/floorSections.ts`. Null
   * hides the "View in Floor" button entirely rather than showing a dead
   * control: on a project where only some floors have been sectioned (the
   * normal state while an admin works through them), a disabled button on
   * every other unit would read as broken. */
  floorSectionName: string | null;
  /** Whether that cut is currently applied — the button is a toggle, and
   * the state it toggles lives in the runtime, not here. */
  floorSectionActive: boolean;
  onViewInFloor: () => void;
  onClose: () => void;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const priceFmt = usePriceFormat();
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const auth = useAppStore((s) => s.auth);
  const saved = useAppStore((s) => s.saved.projects.includes(project.id));
  const toggleSaved = useAppStore((s) => s.toggleSavedProject);
  const compare = useAppStore((s) => s.compare);
  const addCompare = useAppStore((s) => s.addCompare);
  const removeCompareAt = useAppStore((s) => s.removeCompareAt);
  const compareIndex = compare.findIndex((c) => c.kind === "unit" && c.entity.id === unit.id);
  const inCompare = compareIndex !== -1;
  const [designLeadSent, setDesignLeadSent] = useState(false);
  const eligibleForDesign = project.status === "under_construction" && unit.type === "residential";

  const shellRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // Real measured heights of the two panes, and how much room the viewport
  // actually leaves below the card's fixed top offset. Both are needed before
  // the shell can be given an explicit height — which it must have, since
  // `height: auto` is not a tweenable value.
  const [paneHeights, setPaneHeights] = useState({ compact: 0, detail: 0 });
  const [limits, setLimits] = useState({
    compactWidth: COMPACT_WIDTH_DESKTOP,
    maxWidth: EXPANDED_WIDTH,
    maxHeight: 560,
  });

  const measureLimits = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    // The shell's top is set by CSS (see its own `top-…` below) and never
    // depends on its own height, so reading it back here can't feed back into
    // itself — and reading it rather than recomputing the header's geometry in
    // JS keeps the safe-area insets in that CSS the single source of truth.
    const { top } = shell.getBoundingClientRect();
    const narrow = window.innerWidth < 640;
    const gutter = narrow ? CHROME_GUTTER_MOBILE : CHROME_GUTTER_DESKTOP;
    // The bottom dock is the one piece of chrome the card can genuinely grow
    // into: it's pinned one gutter off the bottom edge at a known fixed height
    // (layoutState.ts — `lg:h-[62px]` from desktop up; below that, content-
    // driven off a 70px floor plus DockShell's own 2px border). Reserving it
    // here is what lets the card sit high under the header without its
    // expanded state running underneath the dock on a phone.
    // Measured, not assumed: below `lg` the dock's height is content-driven,
    // and Units — the one mode a unit can actually be clicked from — is
    // explicitly allowed to be taller than the rest. The constants are the
    // fallback for the frame before it has mounted (`+ 2` is DockShell's own
    // border, which its 70px content floor doesn't include).
    const dock = document.querySelector<HTMLElement>("[data-viewer-dock]");
    const dockHeight =
      dock?.getBoundingClientRect().height ||
      (window.innerWidth < 1024 ? DOCK_HEIGHT_MOBILE_STANDARD + 2 : DOCK_HEIGHT_DESKTOP);
    setLimits({
      compactWidth: Math.min(
        narrow ? COMPACT_WIDTH_MOBILE : COMPACT_WIDTH_DESKTOP,
        window.innerWidth - gutter * 2
      ),
      maxWidth: Math.min(EXPANDED_WIDTH, window.innerWidth - gutter * 2),
      maxHeight: Math.max(240, window.innerHeight - top - dockHeight - gutter * 2),
    });
  }, []);

  useLayoutEffect(() => {
    measureLimits();
    window.addEventListener("resize", measureLimits);
    return () => window.removeEventListener("resize", measureLimits);
  }, [measureLimits]);

  useLayoutEffect(() => {
    const compact = compactRef.current;
    const detail = detailRef.current;
    if (!compact || !detail) return;
    const sync = () =>
      setPaneHeights((prev) =>
        prev.compact === compact.offsetHeight && prev.detail === detail.offsetHeight
          ? prev
          : { compact: compact.offsetHeight, detail: detail.offsetHeight }
      );
    sync();
    // Covers everything that changes a pane's height without a prop change of
    // its own: a media tab swap, a status chip growing in Albanian, the
    // design-lead button losing its label once sent.
    const observer = new ResizeObserver(sync);
    observer.observe(compact);
    observer.observe(detail);
    return () => observer.disconnect();
  }, []);

  const compactWidth = limits.compactWidth;
  const targetWidth = expanded ? limits.maxWidth : compactWidth;
  const targetHeight = expanded
    ? Math.min(paneHeights.detail, limits.maxHeight)
    : paneHeights.compact;

  const firstRun = useRef(true);
  const prevExpanded = useRef(expanded);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const compact = compactRef.current;
    const detail = detailRef.current;
    if (!shell || !compact || !detail || !targetHeight) return;

    // First paint: no morph to run, just place the shell and play the card's
    // own entrance. (Ran with `targetHeight === 0` on the very first pass, so
    // this is the first pass that has real measurements to work with.)
    if (firstRun.current) {
      firstRun.current = false;
      gsap.set(shell, { width: targetWidth, height: targetHeight });
      gsap.set(compact, { autoAlpha: expanded ? 0 : 1 });
      gsap.set(detail, { autoAlpha: expanded ? 1 : 0 });
      gsap.fromTo(
        shell,
        { autoAlpha: 0, y: -8, scale: 0.96 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: reducedMotion ? 0.001 : 0.3,
          ease: "power3.out",
        }
      );
      return;
    }

    const modeChanged = prevExpanded.current !== expanded;
    prevExpanded.current = expanded;

    // Not a state change — a pane simply got taller/shorter (media tab, window
    // resize). Follow it without replaying the cross-fade.
    if (!modeChanged) {
      const tween = gsap.to(shell, {
        width: targetWidth,
        height: targetHeight,
        duration: reducedMotion ? 0.001 : 0.2,
        ease: "power2.out",
      });
      return () => {
        tween.kill();
      };
    }

    const duration = reducedMotion ? 0.001 : 0.42;
    const outgoing = expanded ? compact : detail;
    const incoming = expanded ? detail : compact;
    const timeline = gsap.timeline();
    timeline
      .to(shell, { width: targetWidth, height: targetHeight, duration, ease: "power3.inOut" }, 0)
      // The two fades deliberately overlap. Found in a mid-morph capture:
      // clearing the outgoing pane fast (0.35) and starting the incoming one
      // late (0.3) left ~80ms where both were near-transparent and the card
      // was an empty white box — which reads as a flash, not a morph. The
      // incoming pane now starts while the outgoing one is still legible, so
      // there is always content in the box.
      .to(outgoing, { autoAlpha: 0, duration: duration * 0.5, ease: "power1.out" }, 0)
      .fromTo(
        incoming,
        { autoAlpha: 0, y: expanded ? 10 : -6 },
        { autoAlpha: 1, y: 0, duration: duration * 0.85, ease: "power2.out" },
        duration * 0.15
      );
    return () => {
      timeline.kill();
    };
  }, [expanded, targetWidth, targetHeight, reducedMotion]);

  // Escape steps back out of the detail state rather than closing the card
  // outright — the same one-step-back the collapse button gives.
  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCollapse();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, onCollapse]);

  const statusChip = (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
        unit.status === "available" && "bg-emerald-400/15 text-emerald-300",
        unit.status === "reserved" && "bg-amber-400/15 text-amber-300",
        unit.status === "sold" && "bg-white/10 text-white/55"
      )}
    >
      {t(STATUS_LABEL_KEY[unit.status])}
    </span>
  );

  const specRow = (
    <div className="flex items-center gap-2.5 text-[11px] text-white/55 sm:gap-3 sm:text-xs">
      <span className="flex items-center gap-1">
        <BedDouble className="h-3.5 w-3.5" /> {unit.bedrooms}
      </span>
      <span className="flex items-center gap-1">
        <Bath className="h-3.5 w-3.5" /> {unit.bathrooms}
      </span>
      <span className="flex items-center gap-1">
        <Ruler className="h-3.5 w-3.5" /> {unit.area} m²
      </span>
      <span className="ml-auto">{statusChip}</span>
    </div>
  );

  const closeButton = (
    <button
      onClick={onClose}
      aria-label={t("common.close")}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white"
    >
      <X className="h-4 w-4" />
    </button>
  );

  const saveButton = (className: string, withLabel: boolean) => (
    <button
      onClick={() => auth.signedIn && toggleSaved(project.id)}
      disabled={!auth.signedIn}
      aria-label={saved ? t("unit.savedProject") : t("unit.saveProject")}
      aria-pressed={saved}
      className={className}
    >
      <Heart className={cn("h-4 w-4 shrink-0", saved && "fill-red-500 text-red-500")} />
      {withLabel && (
        <span className="truncate">{saved ? t("unit.savedProject") : t("unit.saveProject")}</span>
      )}
    </button>
  );

  const compareButton = (className: string, withLabel: boolean) => (
    <button
      onClick={() =>
        inCompare
          ? removeCompareAt(compareIndex)
          : addCompare({
              kind: "unit",
              entity: unit,
              projectName: project.name,
              projectSlug: project.slug,
            })
      }
      disabled={unit.status === "sold"}
      aria-label={inCompare ? t("listing.inCompare") : t("nav.compare")}
      aria-pressed={inCompare}
      className={className}
    >
      {inCompare ? (
        <Check className="h-4 w-4 shrink-0" />
      ) : (
        <SquareStack className="h-4 w-4 shrink-0" />
      )}
      {withLabel && <span className="truncate">{inCompare ? t("listing.inCompare") : t("nav.compare")}</span>}
    </button>
  );

  // Only the detail state's footer renders Save/Compare now, and it renders
  // them as full-width labelled buttons — the compact 32px icon variant they
  // used in the preview row has no remaining call site.
  const wideButtonClass =
    "flex flex-1 items-center justify-center gap-1.5 rounded-control border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40";

  return (
    <div
      ref={shellRef}
      role="dialog"
      aria-label={unit.code}
      // Pinned to the top-right corner immediately under the header row
      // (direct design feedback, 2026-08-24, mobile) — and expressed in the
      // header's *own* insets rather than numbers of its own, so the card
      // can't drift out of the viewer's spacing rhythm:
      //   right = the header's own edge inset — `max(0.75rem,
      //           env(safe-area-inset-right))` below `sm`, `1rem` from `sm:`
      //           (its `pr-[max(0.75rem,…)]` / `sm:p-4`) — so this card's
      //           right edge lines up exactly with the utilities capsule
      //           above it.
      //   top   = that same inset (the header's own `pt-`) + `3rem`, the
      //           fixed `h-12` every header pill shares (ProjectIdentity /
      //           NorthCompass / ViewerUtilities — see ProjectIdentity's own
      //           doc comment) + one more gutter of air, which is the same
      //           gap the dock keeps at the bottom edge. `sm:top-20` is that
      //           arithmetic at the desktop gutter (1 + 3 + 1rem); it drops
      //           `env()` because the header's `sm:p-4` does too.
      // It used to sit at `top-32`, clearing the compare/construction cluster
      // in this same corner; that cluster now yields to the card instead (see
      // ProjectViewerRuntime's own `unitCardOpen` gate) rather than pushing it
      // a third of the way down the screen.
      //
      // `--shadow-2` ("drawer / popover"), not `--shadow-3` ("modal only") —
      // this is a popover over a live scene, and the lighter lift reads as the
      // more premium of the two at this size.
      className="viewer-glass absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)] z-30 origin-top-right overflow-hidden rounded-panel shadow-[var(--shadow-2)] sm:right-4 sm:top-20"
      style={{ width: compactWidth }}
    >
      {/* Both panes are pinned to the shell's top-right corner at their own
          fixed width, so the shell's growth reveals the detail pane leftwards
          from the anchor the preview already occupied — nothing jumps. */}
      <div
        ref={compactRef}
        className="absolute right-0 top-0 p-3 sm:p-4"
        style={{ width: compactWidth }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 sm:text-[11px] sm:tracking-wide">
              {t("unit.floorLabel", { n: unit.floor })} · {unit.code}
            </p>
            <p className="font-numeric mt-0.5 text-[17px] font-semibold leading-tight text-white sm:text-xl sm:leading-normal">
              {priceFmt(unit.price)}
            </p>
          </div>
          {/* Pulled into the card's own padding so the × reads as sitting in
              the corner rather than indenting the row it shares. */}
          <div className="-mr-1 -mt-0.5">{closeButton}</div>
        </div>

        <div className="mt-2 sm:mt-2.5">{specRow}</div>

        {/* Two actions, both about *seeing* this unit — Save and Compare
            moved out (2026-08-25 direct instruction) and now live only in
            the detail state's own footer, which is where a decision about
            a unit is actually being made. What replaces them is the one
            thing the preview couldn't do before: cut the building open at
            this unit's own floor.

            Both share the row evenly (`flex-1 min-w-0`) rather than the
            old "two 32px squares + everything else". The compact card is
            256px wide on a phone, and Albanian labels run wide (see the
            "rozaris-viewer-locale-width-deltas" note) — so each label
            truncates rather than forcing the row to overflow, and each
            button carries the full sentence in its `title`/`aria-label`. */}
        <div className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-3 sm:mt-3.5 sm:gap-2 sm:pt-3.5">
          {floorSectionName && (
            <button
              onClick={onViewInFloor}
              aria-pressed={floorSectionActive}
              title={t(floorSectionActive ? "unit.exitFloorViewTitle" : "unit.viewInFloorTitle", { n: unit.floor })}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-control border text-[12px] font-semibold transition-colors sm:h-9 sm:gap-1.5 sm:text-[13px]",
                floorSectionActive
                  ? "border-brand-400/60 bg-brand-500/25 text-white"
                  : "border-white/15 bg-white/5 text-white/85 hover:bg-white/10 hover:text-white"
              )}
            >
              <Layers className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span className="truncate">{t(floorSectionActive ? "unit.exitFloorView" : "unit.viewInFloor")}</span>
            </button>
          )}
          <button
            onClick={onExpand}
            className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-control bg-brand-500 text-[12px] font-semibold text-white transition-colors hover:bg-brand-600 sm:h-9 sm:gap-1.5 sm:text-[13px]"
          >
            <span className="truncate">{t("results.viewUnit")}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>

      <div ref={detailRef} className="absolute right-0 top-0" style={{ width: limits.maxWidth }}>
        <div className="flex flex-col" style={{ maxHeight: limits.maxHeight }}>
          {/* Header intentionally repeats the preview's own eyebrow/price/spec
              geometry — it's the anchor that makes the morph read as growth. */}
          <div className="shrink-0 border-b border-white/10 px-3.5 pb-2.5 pt-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  {t("unit.floorLabel", { n: unit.floor })} · {unit.code}
                </p>
                <p className="font-numeric mt-0.5 text-lg font-semibold leading-tight text-white">
                  {priceFmt(unit.price)}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-white/45">{project.name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={onCollapse}
                  aria-label={t("unit.collapseUnitDetail")}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
                {closeButton}
              </div>
            </div>
            <div className="mt-2">{specRow}</div>
          </div>

          <div className="scroll-none min-h-0 flex-1 overflow-y-auto px-3.5 pb-3 pt-3">
            <UnitMedia key={unit.id} unit={unit} />

            {/* Three facts, not the five this used to carry: Floor and Area
                were already stated verbatim in the header two rows above
                (the eyebrow's "FLOOR 8 · A-003" and the spec row's "70 m²"),
                so two of four cards were restating what the eye had just
                read, and Type sat below them as a lone orphan line. What is
                left is only what the header does not say. */}
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <Fact icon={Home} label={t("unit.viewerBuilding")} value={unit.buildingName} />
              <Fact
                icon={Compass}
                label={t("unit.orientation")}
                value={
                  unit.orientation
                    ? t(ORIENTATION_LABEL_KEY[unit.orientation]).split(" ")[0]
                    : "—"
                }
              />
              <Fact icon={SquareStack} label={t("unit.typeLabel")} value={t(TYPE_LABEL_KEY[unit.type])} />
            </div>

            {eligibleForDesign && (
              <button
                onClick={() => setDesignLeadSent(true)}
                disabled={designLeadSent}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-control bg-listing-new-dev px-3 py-2 text-xs font-semibold text-white transition-[filter] hover:brightness-95 disabled:opacity-60"
              >
                <Palette className="h-3.5 w-3.5" />
                {designLeadSent ? t("unit.requestSent") : t("unit.designThisApartment")}
              </button>
            )}

            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                {t("listing.contactPublisher")}
              </p>
              <PublisherCard
                bare
                tone="dark"
                compact
                publisher={project.developer}
                whatsappMessage={`Hi, I'm interested in unit ${unit.code} at ${project.name}`}
                contentTitle={`${project.name} — ${unit.code}`}
                contentUrl={`${SITE_URL}/project/${project.slug}?unit=${unit.id}`}
                trackEntity={{ type: "project", id: project.id }}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3.5 py-2.5">
            {saveButton(wideButtonClass, true)}
            {compareButton(
              cn(
                wideButtonClass,
                inCompare && "border-brand-400/60 bg-brand-500/25 text-white hover:bg-brand-500/25"
              ),
              true
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-white/40">
        <Icon className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-white">{value}</p>
    </div>
  );
}

type MediaTab = "photos" | "floorplan" | "facade" | "video";

/**
 * The listing page's `Gallery` sized for a full content column — tab bar
 * below the frame, 16/9 image — which is a lot of vertical budget inside a
 * 384px card that also has to show facts and a contact block. This is the same
 * media set at card density: one frame, controls overlaid on it.
 */
function UnitMedia({ unit }: { unit: Unit }) {
  const { t } = useT();
  const [tab, setTab] = useState<MediaTab>("photos");
  const [index, setIndex] = useState(0);

  const tabs = useMemo(() => {
    const list: { key: MediaTab; label: string }[] = [
      { key: "photos", label: t("gallery.tabPhotos") },
      { key: "floorplan", label: t("gallery.tabFloorplan") },
    ];
    if (unit.facadeImage) list.push({ key: "facade", label: t("gallery.tabFacade") });
    if (unit.videoUrl) list.push({ key: "video", label: t("gallery.tabVideo") });
    return list;
  }, [t, unit.facadeImage, unit.videoUrl]);

  const seeds = Array.from({ length: PHOTO_COUNT }, (_, i) => `${unit.id}-photo-${i}`);

  return (
    <div className="overflow-hidden rounded-card border border-white/10">
      {/* 16/9, not the 16/10 this shipped with: at the detail pane's 384px
          the taller ratio spent ~240px on a placeholder before a single
          fact was visible, which is most of what read as empty space. */}
      <div className="relative aspect-[16/9] w-full bg-white/5">
        {tab === "photos" && (
          <>
            <PlaceholderImage
              seed={seeds[index]}
              kind="interior"
              className="h-full w-full"
              iconClassName="h-8 w-8"
              watermark
            />
            <button
              onClick={() => setIndex((i) => (i - 1 + PHOTO_COUNT) % PHOTO_COUNT)}
              aria-label={t("gallery.prevPhoto")}
              className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIndex((i) => (i + 1) % PHOTO_COUNT)}
              aria-label={t("gallery.nextPhoto")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {seeds.map((seed, i) => (
                <button
                  key={seed}
                  onClick={() => setIndex(i)}
                  aria-label={t("gallery.goToPhoto", { n: i + 1 })}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"
                  )}
                />
              ))}
            </div>
          </>
        )}
        {tab === "floorplan" && (
          <PlaceholderImage
            seed={`${unit.id}-floorplan`}
            kind="floorplan"
            className="h-full w-full"
            iconClassName="h-8 w-8"
          />
        )}
        {tab === "facade" && (
          <PlaceholderImage
            seed={`${unit.id}-facade`}
            kind="facade"
            className="h-full w-full"
            iconClassName="h-8 w-8"
            watermark
          />
        )}
        {tab === "video" && (
          <button
            type="button"
            aria-label={t("gallery.playVideo")}
            className="group h-full w-full cursor-pointer"
          >
            <PlaceholderImage
              seed={`${unit.id}-video`}
              kind="video"
              className="h-full w-full"
              iconClassName="h-10 w-10 transition-transform group-hover:scale-110"
            />
          </button>
        )}
      </div>
      <div className="flex gap-1 border-t border-white/10 p-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={cn(
              "truncate rounded-control px-2 py-1 text-[10px] font-semibold transition-colors",
              tab === key ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10 hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
