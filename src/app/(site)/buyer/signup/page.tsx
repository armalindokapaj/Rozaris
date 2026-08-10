"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { useAppStore, defaultBuyerPreferences } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import type { PropertyType } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROPERTY_TYPES: PropertyType[] = [
  "apartment",
  "house",
  "villa",
  "studio",
  "land",
  "commercial",
  "office",
];

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export default function BuyerSignupPage() {
  const router = useRouter();
  const { t, locale } = useT();
  const signIn = useAppStore((s) => s.signIn);
  const setBuyerProfile = useAppStore((s) => s.setBuyerProfile);
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [transaction, setTransaction] = useState<"buy" | "rent">(defaultBuyerPreferences.transaction);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [maxPrice, setMaxPrice] = useState("");
  const [location, setLocation] = useState(defaultBuyerPreferences.location);

  const canSubmit = name.trim() !== "" && email.trim() !== "";

  function handleSubmit() {
    if (!canSubmit) return;
    setBuyerProfile({
      // A single demo buyer identity, consistent with how the Publisher
      // dashboard is always the same demo publisher — this mock has no real
      // multi-account backend, so the seeded conversations/feed tie to one id.
      id: "buyer-demo-1",
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      preferences: {
        transaction,
        propertyTypes,
        priceMax: maxPrice ? Number(maxPrice) : null,
        location: location.trim() || defaultBuyerPreferences.location,
      },
    });
    signIn(name.trim(), "buyer");
    router.push("/buyer/dashboard");
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-card bg-brand-50">
          <UserRound className="h-5 w-5 text-brand-600" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{t("buyer.signupTitle")}</h1>
          <p className="text-sm text-neutral-500">{t("buyer.signupSubtitle")}</p>
        </div>
      </div>

      <div className="space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
        <Field label={t("buyer.nameLabel")}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("buyer.emailLabel")}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </Field>
          <Field label={t("buyer.phoneLabel")}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </Field>
        </div>

        <div className="h-px bg-neutral-100" />

        <h2 className="text-sm font-bold text-neutral-900">{t("buyer.preferencesTitle")}</h2>

        <Field label={t("buyer.transactionLabel")}>
          <div className="grid grid-cols-2 gap-2 rounded-control bg-neutral-100 p-1">
            {(["buy", "rent"] as const).map((txn) => (
              <button
                key={txn}
                type="button"
                onClick={() => setTransaction(txn)}
                className={cn(
                  "rounded-[10px] py-2 text-sm font-semibold transition-colors",
                  transaction === txn ? "bg-white text-neutral-900 shadow-[var(--shadow-1)]" : "text-neutral-500 hover:text-neutral-700"
                )}
              >
                {txn === "buy" ? t("nav.buy") : t("nav.rent")}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("buyer.propertyTypesLabel")}>
          <div className="flex flex-wrap gap-1.5">
            {PROPERTY_TYPES.map((pt) => (
              <button
                key={pt}
                type="button"
                onClick={() => setPropertyTypes((v) => toggle(v, pt))}
                aria-pressed={propertyTypes.includes(pt)}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
                  propertyTypes.includes(pt)
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                )}
              >
                {propertyTypeLabels[pt]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("buyer.maxPriceLabel")}>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </Field>
          <Field label={t("buyer.locationLabel")}>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </Field>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("buyer.createProfile")}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
