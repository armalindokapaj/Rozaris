"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Copy,
  ExternalLink,
  Hand,
  Info,
  LogOut,
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
import { useAppStore } from "@/lib/store";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
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
 * Deliberately no open/close fade — the predecessor dropdown this
 * replaces was instant conditional rendering too; PRD §4's ~180-250ms
 * fade+shift is a real, minor, flagged gap, not a silent regression.
 */
export function MoreMenu({ project }: { project: MoreMenuProjectInfo }) {
  const { t } = useT();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<MoreSection>("none");
  const [linkCopied, setLinkCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);
  const { areaUnit, reducedMotionOverride, interfaceAutoHide, setAreaUnit, setReducedMotionOverride, setInterfaceAutoHide, reset } =
    useViewerPreferences();

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
          className="mb-1 flex w-full items-center gap-1.5 rounded-control px-2.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/60 hover:bg-white/5 hover:text-white"
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
              className="flex h-11 w-full items-center gap-2.5 rounded-control px-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-white/5">
                <Icon className="h-4 w-4 text-white/70" aria-hidden="true" />
              </span>
              {label}
            </button>
          ))}
          <div className="my-1 border-t border-white/10" />
          <Link
            href={projectPageHref}
            role="menuitem"
            onClick={closeAll}
            className="flex h-11 w-full items-center gap-2.5 rounded-control px-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-white/5">
              <LogOut className="h-4 w-4 text-white/70" aria-hidden="true" />
            </span>
            {t("more.exitViewer")}
          </Link>
        </div>
      )}

      {section === "projectInformation" && (
        <div className="space-y-3 px-2.5 py-1.5">
          <div>
            <p className="text-sm font-semibold text-white">{project.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-white/60">
              {project.developerName}
              {project.developerVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-400" aria-label={t("more.verified")} />}
            </p>
          </div>
          <p className="text-xs text-white/60">{project.city}</p>
          <p className="text-xs text-white/60">{t(`more.propertyType.${project.propertyType}`)}</p>
          {project.completionLabel && (
            <p className="text-xs text-white/60">
              {t("more.completion")}: {project.completionLabel}
            </p>
          )}
          <Link
            href={projectPageHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeAll}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-control bg-brand-500 text-xs font-semibold text-white hover:bg-brand-400"
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
            className="flex h-10 w-full items-center gap-3 rounded-control px-2.5 text-sm font-medium text-white hover:bg-white/10"
          >
            <Copy className="h-4 w-4 text-white/60" aria-hidden="true" />
            {linkCopied ? t("more.linkCopied") : t("more.copyLink")}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeAll}
            className="flex h-10 w-full items-center gap-3 rounded-control px-2.5 text-sm font-medium text-white hover:bg-white/10"
          >
            <MessageCircle className="h-4 w-4 text-white/60" aria-hidden="true" />
            {t("more.shareWhatsApp")}
          </a>
          <a
            href={`mailto:?body=${encodeURIComponent(shareUrl)}`}
            onClick={closeAll}
            className="flex h-10 w-full items-center gap-3 rounded-control px-2.5 text-sm font-medium text-white hover:bg-white/10"
          >
            <Mail className="h-4 w-4 text-white/60" aria-hidden="true" />
            {t("more.shareEmail")}
          </a>
        </div>
      )}

      {section === "settings" && (
        <div className="space-y-3 px-2.5 py-1.5">
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
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-control border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5 hover:text-white"
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
      {open && (
        <div
          role="dialog"
          // `w-56` (was `w-64` on every device) below `sm`, back to the
          // original `w-64` at `sm`+ — direct design feedback, 2026-08-17,
          // mobile only: "try to make it narrower". The Settings section's
          // own controls (now `SegmentedToggle` pills instead of native
          // `<select>`s) comfortably fit the narrower width too.
          className="viewer-dropdown-in viewer-glass absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-panel shadow-[var(--shadow-2)] sm:w-64"
        >
          {/* Only shown for the root list — an open subsection already gets
              its own "← Back / Section Title" row inside `body` below,
              which is that section's header equivalent. */}
          {section === "none" && (
            <div className="border-b border-white/10 px-3.5 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{t("viewer.more")}</span>
            </div>
          )}
          {body}
        </div>
      )}
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-white/70">{label}</span>
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
  return (
    <div className="flex items-center justify-between rounded-control bg-white/[0.03] px-3 py-2 text-xs">
      <span className="flex items-center gap-2 text-white/70">
        <Icon className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
        {gesture}
      </span>
      <span className="font-medium text-white">{action}</span>
    </div>
  );
}
