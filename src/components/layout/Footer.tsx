import Link from "next/link";
import { Camera, Link2, PlayCircle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

// lucide-react ships no brand/logo icons (dropped for trademark reasons) —
// these are generic stand-ins (camera/link/play), not real social handles,
// since ROZARIS has no actual Instagram/LinkedIn/YouTube accounts yet.
const SOCIAL_ICONS = [Camera, Link2, PlayCircle];

/**
 * Shared site footer for content/document-flow pages (Developers directory,
 * Help). Deliberately NOT mounted globally in the (site) layout — pages
 * like Search, the 3D project viewer, Admin, and the dashboards are
 * fixed-height app shells (`h-full` flex columns) that a footer would
 * break; those keep their own bottom chrome instead.
 */
export function Footer() {
  const { t } = useT();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 px-4 py-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-sm text-neutral-500 sm:flex-row sm:justify-between">
        <p>© {year} ROZARIS</p>
        <nav className="flex items-center gap-5" aria-label={t("footer.legalNav")}>
          <Link href="/help" className="hover:text-neutral-900">
            {t("footer.privacyPolicy")}
          </Link>
          <Link href="/help" className="hover:text-neutral-900">
            {t("footer.termsOfUse")}
          </Link>
          <Link href="/help#contact" className="hover:text-neutral-900">
            {t("footer.contactUs")}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {SOCIAL_ICONS.map((Icon, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-control border border-neutral-200 text-neutral-400"
            >
              <Icon className="h-4 w-4" />
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
