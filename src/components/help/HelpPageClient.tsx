"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Headphones,
  Mail,
  MessageCircle,
  Rotate3d,
  Search,
  ShieldCheck,
  Users,
  ListFilter,
} from "lucide-react";
import { HeroSketch } from "@/components/common/HeroSketch";
import { Footer } from "@/components/layout/Footer";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

const CONTACT_EMAIL = "hello@rozaris.al";

type Topic = "3d" | "listings" | "publishers";

const FAQ_ITEMS: { key: string; topic: Topic }[] = [
  { key: "map", topic: "3d" },
  { key: "faq1", topic: "3d" },
  { key: "faq2", topic: "3d" },
  { key: "faq3", topic: "listings" },
  { key: "faq5", topic: "listings" },
  { key: "faq4", topic: "publishers" },
];

const TOPIC_ICON: Record<Topic, typeof Rotate3d> = {
  "3d": Rotate3d,
  listings: Building2,
  publishers: Users,
};

const TOPIC_LABEL_KEY: Record<Topic, string> = {
  "3d": "helpPage.topic3d",
  listings: "helpPage.topicListings",
  publishers: "helpPage.topicPublishers",
};

function questionKey(key: string) {
  return key === "map" ? "helpPage.mapTitle" : `helpPage.${key}Q`;
}
function answerKey(key: string) {
  return key === "map" ? "helpPage.mapBody" : `helpPage.${key}A`;
}

export function HelpPageClient() {
  const { t } = useT();
  const [copiedAt, setCopiedAt] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const target = hash ? document.getElementById(hash) : null;
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (topic !== "all" && item.topic !== topic) return false;
      if (!q) return true;
      const question = t(questionKey(item.key)).toLowerCase();
      const answer = t(answerKey(item.key)).toLowerCase();
      return question.includes(q) || answer.includes(q);
    });
  }, [query, topic, t]);

  const topicCount = (ty: Topic) => FAQ_ITEMS.filter((i) => i.topic === ty).length;

  async function handleEmailClick(e: React.MouseEvent<HTMLButtonElement>) {
    await navigator.clipboard.writeText(CONTACT_EMAIL);
    setCopiedAt({ x: e.clientX, y: e.clientY });
    window.setTimeout(() => setCopiedAt(null), 1400);
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-600">
              {t("helpPage.heroEyebrow")}
            </p>
            <h1 className="mt-1 font-serif text-4xl text-neutral-900 sm:text-5xl">
              {t("helpPage.heroHeadline")}
            </h1>
            <p className="mt-2 text-sm text-neutral-500 sm:text-base">{t("helpPage.subtitle")}</p>
          </div>
          <HeroSketch className="hidden h-32 w-52 shrink-0 text-neutral-300 sm:block" />
        </div>

        <div className="mt-6 flex h-12 max-w-xl items-center gap-2 rounded-control border border-neutral-200 bg-white px-4">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("helpPage.searchPlaceholder")}
            className="w-full bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded-[4px] border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 sm:block">
            ⌘K
          </kbd>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-4">
            <div>
              <p className="text-sm font-bold text-neutral-900">{t("helpPage.browseByTopic")}</p>
              <div className="mt-2 flex flex-col gap-0.5">
                <TopicRow
                  icon={ListFilter}
                  label={t("helpPage.allTopics")}
                  count={FAQ_ITEMS.length}
                  active={topic === "all"}
                  onClick={() => setTopic("all")}
                />
                {(["3d", "listings", "publishers"] as const).map((ty) => (
                  <TopicRow
                    key={ty}
                    icon={TOPIC_ICON[ty]}
                    label={t(TOPIC_LABEL_KEY[ty])}
                    count={topicCount(ty)}
                    active={topic === ty}
                    onClick={() => setTopic(ty)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-card border border-neutral-200 bg-white p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Headphones className="h-4 w-4" />
              </span>
              <p className="mt-2.5 text-sm font-bold text-neutral-900">{t("helpPage.stillNeedHelp")}</p>
              <p className="text-xs text-neutral-500">{t("helpPage.teamHereForYou")}</p>
              <a href="#contact" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                {t("helpPage.contactUsLink")} <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </aside>

          <div>
            <h2 className="font-serif text-xl text-neutral-900">{t("helpPage.faqSectionTitle")}</h2>

            {filtered.length === 0 ? (
              <p className="mt-4 rounded-card border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
                {t("helpPage.noFaqMatch")}
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {filtered.map(({ key }) => (
                  <details key={key} className="group rounded-card border border-neutral-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-neutral-900">
                      {t(questionKey(key))}
                      <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="px-4 pb-4 text-sm leading-relaxed text-neutral-600">{t(answerKey(key))}</p>
                  </details>
                ))}
              </div>
            )}

            <div
              id="about"
              className="mt-6 flex flex-col gap-5 overflow-hidden rounded-panel bg-brand-50 p-5 sm:flex-row sm:items-center"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-brand-100 text-brand-600">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h3 className="font-serif text-lg text-neutral-900">{t("helpPage.aboutTitle")}</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{t("helpPage.aboutBody")}</p>
                <Link
                  href="/about"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
                >
                  {t("helpPage.learnMoreAboutUs")} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            <section id="contact" className="mt-6 rounded-panel border border-neutral-200 bg-white p-5">
              <h2 className="text-base font-bold text-neutral-900">{t("helpPage.contactTitle")}</h2>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <button
                  type="button"
                  onClick={handleEmailClick}
                  className="flex w-fit items-center gap-2 text-neutral-600 hover:text-brand-600"
                >
                  <Mail className="h-4 w-4" /> {CONTACT_EMAIL}
                </button>
                <a
                  href="https://wa.me/355691234567"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-neutral-600 hover:text-brand-600"
                >
                  <MessageCircle className="h-4 w-4" /> {t("helpPage.contactWhatsapp")}
                </a>
              </div>
            </section>

            <p className="mt-6 text-xs text-neutral-400">{t("helpPage.prototypeNote")}</p>
          </div>
        </div>
      </div>

      <Footer />

      {copiedAt && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white shadow-[var(--shadow-1)]"
          style={{ left: copiedAt.x, top: copiedAt.y - 8 }}
        >
          {t("helpPage.emailCopied")}
        </span>
      )}
    </div>
  );
}

function TopicRow({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof Rotate3d;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm transition-colors",
        active ? "bg-brand-50 font-semibold text-brand-700" : "text-neutral-600 hover:bg-neutral-50"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      <span className={cn("text-xs", active ? "text-brand-500" : "text-neutral-400")}>{count}</span>
    </button>
  );
}
