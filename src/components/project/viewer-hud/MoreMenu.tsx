"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  Copy,
  ExternalLink,
  Hand,
  Info,
  Mail,
  MessageCircle,
  MoreHorizontal,
  MousePointerClick,
  RotateCcw,
  Settings as SettingsIcon,
  Share2,
  ZoomIn,
} from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useAppStore } from "@/lib/store";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
import { VIEWER_QUALITY_LEVELS, type ViewerQualityLevel } from "@/lib/viewerQuality";
import { cn } from "@/lib/utils";
import type { Currency, Locale, PropertyType } from "@/lib/types";

type MoreSection = "none" | "projectInformation" | "share" | "settings" | "help";

export interface MoreMenuProjectInfo {
  slug: string;
  name: string;
  developerName: string;
  developerVerified: boolean;
  city: string;
  propertyType: PropertyType;
  completionLabel: string;
}

/**
 * More / Settings Menu PRD (2026-08-16) — the real "•••" menu, replacing
 * ViewerUtilities' own hand-rolled disabled-preview dropdown (kept the
 * same hand-rolled open/close-triple pattern that predecessor already
 * used — see its own doc comment for why `useDropdown` isn't used here).
 *
 * All 5 real items open in the SAME dropdown, on every device — mobile
 * used to get a distinct `position:fixed`, body-portaled bottom sheet
 * (worked around a real containing-block bug: ViewerHUD's own load-
 * sequence GSAP tween leaves an identity `transform` on this button's
 * header ancestor, which makes THAT the containing block for any `fixed`
 * descendant instead of the real viewport). Replaced (direct design
 * feedback, 2026-08-17: "Top right settings will dropdown from the 3
 * dots" on mobile too, not a full-width sheet) with the exact same
 * `position:absolute` dropdown desktop already used — anchored to
 * `rootRef` (`position:relative`), so it was never actually susceptible
 * to that transform/containing-block bug in the first place (that bug is
 * specific to `fixed`, not `absolute`), no portal needed. Branches on
 * `section` with a "← Back" header — same container-reuse pattern
 * UnitsWorkspace already established for its own search↔detail swap, not
 * a coincidence: both PRDs describe the same "one panel, multiple views"
 * shape. §22 "Global Menu-State Rule" is satisfied for free — this
 * component never touches `activeModule`/Sun & Time/Units state, so
 * opening it can't disturb any of that.
 *
 * Real vs. flagged, section by section:
 * - Project Information: real project fields; "View Project Page" links
 *   to the actual editorial project page (`/projects/[slug]`, distinct
 *   from this `/project/[slug]` 3D-viewer route).
 * - Share: real Copy Link (clipboard)/WhatsApp/Email using the current
 *   page URL. PRD §8's optional `?unit=A-503` deep-link isn't added — the
 *   selected-unit id lives inside UnitsWorkspace's own local state, not
 *   lifted anywhere this component could read it, and the PRD itself
 *   calls that link variant optional.
 * - Settings: Language/Currency are real (reuse `useAppStore`'s existing
 *   `locale`/`currency`/`setCurrency` — Currency's own real exchange-rate
 *   consumer is new this pass, see unitDisplay.ts). Area Units/Reduced
 *   Motion/Interface Auto-Hide are real, viewer-local preferences (see
 *   useViewerPreferences.ts) that genuinely affect Units Search/Detail
 *   display and every GSAP-animated component in this file tree. Reset
 *   Viewer Preferences is real (resets only that local store, never
 *   `useAppStore`/project data, matching PRD §15's exclusion list).
 * - Help: real static instructions (§17), device-aware via `isDesktop`.
 *   §18's "Help can also repeat the onboarding hint" isn't wired up —
 *   FirstVisitHint's "seen" flag has no supported re-trigger path (see
 *   that component's own doc comment); the same instructions are shown
 *   here directly instead, which is the PRD's own primary Help content
 *   anyway (§17), not a substitute for something missing.
 * - Exit Viewer: real navigation to the same Project Page. No
 *   confirmation dialog (§21 — not destructive). PRD §20's "temporarily
 *   store camera/selected-unit/filters/View/date-time so returning this
 *   session restores it" isn't built — a real session-restore system
 *   touching every module's state, out of proportion for this pass;
 *   flagged, not faked.
 *
 * Fade in/out (2026-08-18, direct instruction: "Settings dropdown is
 * better animated fade in fade out") — the dropdown used to only fade IN
 * (`viewer-dropdown-in`, a CSS keyframe) via plain `{open && (...)}`
 * conditional rendering, which meant CLOSING had no animation at all (an
 * instant unmount). Restructured to the same pattern every other animated
 * HUD panel in this file tree already uses (`UnitsBar`/`ViewsWorkspace`/
 * `ViewerModuleLayer`): stays permanently mounted, toggles via a GSAP
 * `autoAlpha`/`y` tween keyed off `open` instead of a CSS enter-only
 * keyframe, so both directions animate. The old `viewer-dropdown-in` class
 * is dropped from this element (GSAP now owns the same two properties —
 * keeping both would fight over `opacity`/`transform` on open).
 *
 * Mobile-only trim (2026-08-18, direct instruction, under "Mobile view" —
 * desktop's own width/section list is otherwise unchanged): narrower panel
 * (`w-48` vs desktop's `w-64`), and body text is resized down to match
 * `ProjectIdentity`'s own mobile scale ("Text on settings menu should be
 * the same as the panel on the Left" — the only other text-bearing panel
 * sharing this same header row, on the opposite side) —
 * `text-[13px]`/`text-[11px]` in place of `text-sm`/`text-xs`, via the
 * `textPrimary`/`textSecondary` locals below. Gated on `isDesktop` (this
 * file's own existing 1024px hook) rather than the old `sm:` (640px)
 * breakpoint the width used before, so "mobile" means the same viewport
 * range here as it does for the bottom dock and every other component this
 * session touched.
 *
 * The "MORE" section-header row above the root list and "Exit Viewer" were
 * originally mobile-only removals ("Delete 'More'"/"Delete 'exit viewer'")
 * but a later direct instruction (2026-08-18, "In top right corner when
 * clicking settings: Remove 'More' and 'exit viewer'") dropped both on
 * desktop too — Project Information's own "View Project Page" link is
 * still the real way off this route, on both devices.
 */
export function MoreMenu({ project }: { project: MoreMenuProjectInfo }) {
  const { t } = useT();
  const isDesktop = useIsDesktop();
  const reducedMotion = useEffectiveReducedMotion();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<MoreSection>("none");
  const [linkCopied, setLinkCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Mobile-only text scale, matched to `ProjectIdentity`'s own two sizes
  // (see this component's own doc comment) — desktop keeps the original
  // `text-sm`/`text-xs` everywhere untouched.
  const textPrimary = isDesktop ? "text-sm" : "text-[13px]";
  const textSecondary = isDesktop ? "text-xs" : "text-[11px]";

  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);
  const {
    areaUnit,
    reducedMotionOverride,
    interfaceAutoHide,
    quality,
    setAreaUnit,
    setReducedMotionOverride,
    setInterfaceAutoHide,
    setQuality,
    reset,
  } = useViewerPreferences();

  function closeAll() {
    setOpen(false);
    setSection("none");
  }

  // Applies on every device now (was desktop-only while mobile had its own
  // portaled backdrop handling outside-tap instead — see the module doc
  // comment) — direct design feedback: "clicking outside the dropdown
  // removes the settings menu" on mobile too.
  useClickOutside(rootRef, closeAll, open);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeAll();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Real fade in AND fade out (see this component's own doc comment) —
  // the panel stays mounted (no more `{open && (...)}`) and this is the
  // only thing that ever moves its opacity/position.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    gsap.to(el, {
      autoAlpha: open ? 1 : 0,
      y: open ? 0 : -6,
      duration: reducedMotion ? 0 : 0.18,
      ease: open ? "power2.out" : "power1.in",
    });
  }, [open, reducedMotion]);

  const projectPageHref = `/projects/${project.slug}`;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — no crash, just no confirmation.
    }
  }

  const menuItems: { id: Exclude<MoreSection, "none">; icon: typeof Info; label: string }[] = [
    { id: "projectInformation", icon: Info, label: t("more.projectInformation") },
    { id: "share", icon: Share2, label: t("more.share") },
    { id: "settings", icon: SettingsIcon, label: t("more.settings") },
    { id: "help", icon: Hand, label: t("more.help") },
  ];

  const sectionTitle = section === "none" ? "" : t(`more.${section}`);

  const body = (
    <div className="max-h-[70vh] overflow-y-auto p-1.5">
      {section !== "none" && (
        <button
          type="button"
          onClick={() => setSection("none")}
          className={cn(
            "mb-1 flex w-full items-center gap-1.5 rounded-control px-2.5 py-2 font-semibold uppercase tracking-[0.12em] text-white/60 hover:bg-white/5 hover:text-white",
            textSecondary
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {sectionTitle}
        </button>
      )}

      {section === "none" && (
        <div role="menu" className="space-y-0.5">
          {menuItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => setSection(id)}
              className={cn(
                "flex h-11 w-full items-center gap-2.5 rounded-control px-2 font-medium text-white transition-colors hover:bg-white/10",
                textPrimary
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-white/5">
                <Icon className="h-4 w-4 text-white/70" aria-hidden="true" />
              </span>
              {label}
            </button>
          ))}
        </div>
      )}

      {section === "projectInformation" && (
        <div className="space-y-3 px-2.5 py-1.5">
          <div>
            <p className={cn("font-semibold text-white", textPrimary)}>{project.name}</p>
            <p className={cn("mt-0.5 flex items-center gap-1 text-white/60", textSecondary)}>
              {project.developerName}
              {project.developerVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-400" aria-label={t("more.verified")} />}
            </p>
          </div>
          <p className={cn("text-white/60", textSecondary)}>{project.city}</p>
          <p className={cn("text-white/60", textSecondary)}>{t(`more.propertyType.${project.propertyType}`)}</p>
          {project.completionLabel && (
            <p className={cn("text-white/60", textSecondary)}>
              {t("more.completion")}: {project.completionLabel}
            </p>
          )}
          <Link
            href={projectPageHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeAll}
            className={cn(
              "flex h-9 w-full items-center justify-center gap-1.5 rounded-control bg-brand-500 font-semibold text-white hover:bg-brand-400",
              textSecondary
            )}
          >
            {t("more.viewProjectPage")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {section === "share" && (
        <div className="space-y-1 px-1 py-1">
          <button
            type="button"
            onClick={handleCopyLink}
            className={cn("flex h-10 w-full items-center gap-3 rounded-control px-2.5 font-medium text-white hover:bg-white/10", textPrimary)}
          >
            <Copy className="h-4 w-4 text-white/60" aria-hidden="true" />
            {linkCopied ? t("more.linkCopied") : t("more.copyLink")}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeAll}
            className={cn("flex h-10 w-full items-center gap-3 rounded-control px-2.5 font-medium text-white hover:bg-white/10", textPrimary)}
          >
            <MessageCircle className="h-4 w-4 text-white/60" aria-hidden="true" />
            {t("more.shareWhatsApp")}
          </a>
          <a
            href={`mailto:?body=${encodeURIComponent(shareUrl)}`}
            onClick={closeAll}
            className={cn("flex h-10 w-full items-center gap-3 rounded-control px-2.5 font-medium text-white hover:bg-white/10", textPrimary)}
          >
            <Mail className="h-4 w-4 text-white/60" aria-hidden="true" />
            {t("more.shareEmail")}
          </a>
        </div>
      )}

      {section === "settings" && (
        <div className="space-y-3 px-2.5 py-1.5">
          <QualitySetting value={quality} onChange={setQuality} reducedMotion={reducedMotion} textSecondary={textSecondary} />

          <SettingsRow label={t("more.settingsLanguage")}>
            <SegmentedToggle
              value={locale}
              options={[
                { value: "en", label: "EN" },
                { value: "sq", label: "SQ" },
              ]}
              onChange={(v) => setLocale(v as Locale)}
            />
          </SettingsRow>

          <SettingsRow label={t("more.settingsAreaUnits")}>
            <SegmentedToggle
              value={areaUnit}
              options={[
                { value: "m2", label: "m²" },
                { value: "ft2", label: "ft²" },
              ]}
              onChange={(v) => setAreaUnit(v as "m2" | "ft2")}
            />
          </SettingsRow>

          <SettingsRow label={t("more.settingsCurrency")}>
            <SegmentedToggle
              value={currency}
              options={[
                { value: "EUR", label: "EUR" },
                { value: "ALL", label: "ALL" },
              ]}
              onChange={(v) => setCurrency(v as Currency)}
            />
          </SettingsRow>

          <SettingsRow label={t("more.settingsReducedMotion")}>
            <ToggleButton
              on={reducedMotionOverride === true}
              onLabel={t("more.on")}
              offLabel={t("more.off")}
              onToggle={(v) => setReducedMotionOverride(v ? true : null)}
            />
          </SettingsRow>

          <SettingsRow label={t("more.settingsAutoHide")}>
            <ToggleButton on={interfaceAutoHide} onLabel={t("more.on")} offLabel={t("more.off")} onToggle={setInterfaceAutoHide} />
          </SettingsRow>

          <button
            type="button"
            onClick={reset}
            className={cn(
              "flex h-9 w-full items-center justify-center gap-1.5 rounded-control border border-white/10 font-medium text-white/70 hover:bg-white/5 hover:text-white",
              textSecondary
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("more.settingsReset")}
          </button>
        </div>
      )}

      {section === "help" && (
        <div className="space-y-2.5 px-2.5 py-1.5">
          <HelpRow icon={isDesktop ? Hand : Hand} gesture={t(isDesktop ? "more.helpDrag" : "more.helpSwipe")} action={t("more.helpDragAction")} />
          <HelpRow icon={ZoomIn} gesture={t("more.helpScroll")} action={t("more.helpZoomAction")} />
          <HelpRow
            icon={MousePointerClick}
            gesture={t(isDesktop ? "more.helpClick" : "more.helpTap")}
            action={t("more.helpSelectAction")}
          />
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="relative flex self-stretch">
      <button
        type="button"
        onClick={() => {
          // Real bug found live-testing: closing the menu by re-clicking
          // this same icon (the natural way, not just outside-click/
          // Escape/menu-item-navigation-away — the only three paths that
          // already went through closeAll()) left `section` at whatever
          // sub-panel was last open, so the NEXT open silently landed back
          // there instead of the main list. Always reset alongside the
          // toggle, on both the open and close transition.
          setOpen((v) => !v);
          setSection("none");
        }}
        aria-label={t("viewer.more")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("viewer.more")}
        className={cn(
          "flex w-11 items-center justify-center rounded-control transition-colors",
          open ? "bg-white/10 text-white" : "hover:bg-white/10 hover:text-white/70"
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {/* Always mounted now (was `{open && (...)}`) — GSAP's own
          `autoAlpha`/`y` effect above is what actually shows/hides this,
          so both open AND close animate (see this component's own doc
          comment). `invisible opacity-0` is the matching static initial
          state every other GSAP-toggled panel in this file tree starts
          from (`UnitsBar`/`ViewsWorkspace`'s own identical pattern).
          Width: `w-48` below desktop (was `w-56` — direct instruction,
          2026-08-18: "Settings menu is too large"), `w-64` at desktop,
          unchanged from before. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-hidden={!open}
        className={cn(
          "viewer-glass invisible absolute right-0 top-[calc(100%+8px)] overflow-hidden rounded-panel opacity-0 shadow-[var(--shadow-2)]",
          isDesktop ? "w-64" : "w-48",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        {body}
      </div>
    </div>
  );
}

/**
 * Settings → Quality. Collapsed to a row that reads "Quality  [AUTOMATIC ⌄]";
 * clicking anywhere on the row drops the five levels down (direct
 * instruction, 2026-08-25: "Quality is Clicked then the menu dropdown the
 * qualities"). Picking one applies it and collapses the row again.
 *
 * Styled to match the rest of this Settings panel rather than as its own
 * thing (direct instruction, 2026-08-25: "match everything else") — it
 * first shipped with its own larger type scale, full-width solid-brand
 * selected bar, check marks, a divider and a helper line, none of which
 * any other row here has. Now it reuses exactly the vocabulary
 * `SegmentedToggle`/`ToggleButton` already established two rows below:
 * the trigger is the same `h-7 rounded-pill bg-white/10` control in the
 * same right-hand slot every other row puts its control in, and the
 * dropdown is that same control stacked vertically — one `bg-white/10`
 * track, `rounded-pill` children, `text-[10px]` uppercase, `bg-brand-500`
 * for the selected one. Selection is that brand fill alone, exactly like
 * the toggles, so no check mark is needed to say the same thing twice.
 *
 * The whole row is the trigger, not just the pill, so the label itself is
 * clickable — the row still reads as an ordinary `SettingsRow` because
 * its two halves are styled identically to one.
 *
 * An INLINE disclosure, not a floating popover: the site's shared
 * `DropdownPanel` (components/ui/Dropdown.tsx) is light-themed and
 * `position:absolute`, and this panel is itself an absolutely-positioned
 * `overflow-hidden` shell wrapped around an `overflow-y-auto` body — a
 * nested popover would be clipped by the first and scroll away from its
 * trigger inside the second. Expanding in flow has neither problem.
 *
 * Vertical rather than a 5-across `SegmentedToggle`: five options is well
 * past what a 2-way pill row was built for, and the labels are full words
 * that grow substantially in Albanian ("Maksimale"/"Mesatare"), which a
 * 5-across row inside a 192px mobile panel cannot absorb.
 *
 * Open/close is the same GSAP tween pattern the parent panel itself uses
 * rather than conditional rendering, so CLOSING animates too — `height`
 * to/from `"auto"` alongside `autoAlpha`, which GSAP resolves by
 * measuring, so nothing here hardcodes a row count or pixel height. The
 * whole thing unmounts with the Settings section, so re-entering Settings
 * always starts collapsed.
 */
function QualitySetting({
  value,
  onChange,
  reducedMotion,
  textSecondary,
}: {
  value: ViewerQualityLevel;
  onChange: (level: ViewerQualityLevel) => void;
  reducedMotion: boolean;
  textSecondary: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    gsap.to(el, {
      height: open ? "auto" : 0,
      autoAlpha: open ? 1 : 0,
      duration: reducedMotion ? 0 : 0.2,
      ease: open ? "power2.out" : "power1.in",
    });
  }, [open, reducedMotion]);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="viewer-quality-options"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={cn("text-white/70", textSecondary)}>{t("more.settingsQuality")}</span>
        <span
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-pill px-2.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            open ? "bg-white/20 text-white" : "bg-white/10 text-white/80"
          )}
        >
          {t(`more.quality.${value}`)}
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </span>
      </button>
      {/* `h-0 invisible opacity-0` is the matching static initial state the
          GSAP effect above tweens away from — the same starting pair the
          parent panel uses, plus the height this one also animates. */}
      <div ref={listRef} id="viewer-quality-options" className="invisible h-0 overflow-hidden opacity-0">
        <div
          role="radiogroup"
          aria-label={t("more.settingsQuality")}
          className="mt-1.5 space-y-0.5 rounded-control bg-white/10 p-0.5"
        >
          {VIEWER_QUALITY_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={value === level}
              // Collapses on pick, the way choosing from a dropdown
              // normally does — the trigger shows the new level, so the
              // choice stays visible without the list staying open. Focus
              // goes back to the trigger it came from rather than being
              // dropped on a now-hidden element.
              onClick={() => {
                onChange(level);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={cn(
                "flex h-8 w-full items-center rounded-pill px-2.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                value === level ? "bg-brand-500 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              <span className="truncate">{t(`more.quality.${level}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-white/70", isDesktop ? "text-xs" : "text-[11px]")}>{label}</span>
      {children}
    </div>
  );
}

function ToggleButton({
  on,
  onLabel,
  offLabel,
  onToggle,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onToggle(!on)}
      className={cn(
        "flex h-7 w-16 items-center rounded-pill px-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
        on ? "justify-end bg-brand-500 text-white" : "justify-start bg-white/10 text-white/60"
      )}
    >
      <span className="rounded-pill bg-black/20 px-1.5 py-0.5">{on ? onLabel : offLabel}</span>
    </button>
  );
}

/** Replaces the old native `<select>` for Language/Area Units/Currency
 * (direct design feedback, 2026-08-17, mobile: "fix dropdown options" /
 * "try to make it narrower") — each of these is really a 2-way choice, so
 * a segmented pill (same shape/height as `ToggleButton`, which every
 * other Settings row already uses) reads more consistently than a select
 * with a chevron, and is genuinely narrower. It also sidesteps a real
 * native-`<select>` risk the old markup had: `<option>` only had a
 * `bg-neutral-900` class, and mobile browsers render an OS-native
 * options list that's well known for ignoring/only partially honoring
 * that kind of styling — this control never opens a native picker at
 * all, so there's nothing left for an OS to mis-render. */
function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex h-7 items-center gap-0.5 rounded-pill bg-white/10 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            "rounded-pill px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            value === opt.value ? "bg-brand-500 text-white" : "text-white/60 hover:text-white"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function HelpRow({ icon: Icon, gesture, action }: { icon: typeof Hand; gesture: string; action: string }) {
  const isDesktop = useIsDesktop();
  return (
    <div className={cn("flex items-center justify-between rounded-control bg-white/[0.03] px-3 py-2", isDesktop ? "text-xs" : "text-[11px]")}>
      <span className="flex items-center gap-2 text-white/70">
        <Icon className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
        {gesture}
      </span>
      <span className="font-medium text-white">{action}</span>
    </div>
  );
}
