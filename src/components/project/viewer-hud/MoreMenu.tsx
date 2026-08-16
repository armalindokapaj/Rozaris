"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { useHasMounted } from "@/hooks/useHasMounted";
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
 * All 5 real items open in the SAME dropdown (desktop) / bottom sheet
 * (mobile), branching on `section` with a "← Back" header — same
 * container-reuse pattern UnitsWorkspace already established for its own
 * search↔detail swap, not a coincidence: both PRDs describe the same
 * "one panel, multiple views" shape. §22 "Global Menu-State Rule" is
 * satisfied for free — this component never touches `activeModule`/
 * Sun & Time/Units state, so opening it can't disturb any of that.
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
  const mounted = useHasMounted();
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

  // Desktop only: the mobile sheet is portaled to document.body (see
  // below), so it's no longer a DOM descendant of `rootRef` — this
  // containment check would otherwise treat every tap inside the sheet
  // itself as an "outside" click and close it mid-interaction. The
  // portal's own backdrop `onClick` handles mobile's outside-tap instead.
  useClickOutside(rootRef, closeAll, open && isDesktop);

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
        <div role="menu">
          {menuItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => setSection(id)}
              className="flex h-11 w-full items-center gap-3 rounded-control px-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              <Icon className="h-4 w-4 text-white/60" aria-hidden="true" />
              {label}
            </button>
          ))}
          <div className="my-1 border-t border-white/10" />
          <Link
            href={projectPageHref}
            role="menuitem"
            onClick={closeAll}
            className="flex h-11 w-full items-center gap-3 rounded-control px-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            <LogOut className="h-4 w-4 text-white/60" aria-hidden="true" />
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
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="h-8 rounded-control border border-white/15 bg-white/5 px-2 text-xs text-white"
            >
              <option value="en" className="bg-neutral-900">
                English
              </option>
              <option value="sq" className="bg-neutral-900">
                Shqip
              </option>
            </select>
          </SettingsRow>

          <SettingsRow label={t("more.settingsAreaUnits")}>
            <select
              value={areaUnit}
              onChange={(e) => setAreaUnit(e.target.value as "m2" | "ft2")}
              className="h-8 rounded-control border border-white/15 bg-white/5 px-2 text-xs text-white"
            >
              <option value="m2" className="bg-neutral-900">
                m²
              </option>
              <option value="ft2" className="bg-neutral-900">
                ft²
              </option>
            </select>
          </SettingsRow>

          <SettingsRow label={t("more.settingsCurrency")}>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="h-8 rounded-control border border-white/15 bg-white/5 px-2 text-xs text-white"
            >
              <option value="EUR" className="bg-neutral-900">
                EUR
              </option>
              <option value="ALL" className="bg-neutral-900">
                ALL
              </option>
            </select>
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
    <div ref={rootRef} className="relative">
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
        className="flex w-11 items-center justify-center transition-colors hover:text-white/70"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && isDesktop && (
        <div role="dialog" className="viewer-glass absolute right-0 top-[calc(100%+8px)] w-64 rounded-panel">
          {body}
        </div>
      )}
      {/* Mobile bottom sheet — real bug found live-testing: ViewerHUD's
          own load-sequence GSAP tween leaves an identity `transform`
          (matrix(1,0,0,1,0,0)) on this button's ancestor even after it
          settles, which — per the standard CSS containing-block rule —
          makes THAT element the containing block for any `position:
          fixed` descendant instead of the real viewport. The sheet was
          rendering pinned to the header's own small box instead of the
          screen. `createPortal` into `document.body` sidesteps the whole
          ancestor chain, the correct fix (not "stop animating the
          header", which every other module panel in this file tree also
          depends on). Gated on `mounted` since `document` doesn't exist
          during SSR. */}
      {open && !isDesktop && mounted &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" aria-hidden="true" onClick={closeAll} />
            <div role="dialog" className="viewer-glass fixed inset-x-0 bottom-0 z-50 rounded-t-panel pb-[env(safe-area-inset-bottom)]">
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
              {body}
            </div>
          </>,
          document.body
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
