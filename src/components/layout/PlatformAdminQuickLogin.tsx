"use client";

import { DEMO_ACCOUNTS } from "@/lib/demoAccounts";
import { useT } from "@/lib/i18n/useT";

export function PlatformAdminQuickLogin({
  submit,
  submitting,
  onError,
}: {
  submit: (email: string, password: string) => Promise<boolean>;
  submitting: boolean;
  onError: () => void;
}) {
  const { t } = useT();
  if (process.env.NODE_ENV === "production") return null;

  async function handleLogin() {
    const admin = DEMO_ACCOUNTS.find((account) => account.typeLabel === "Admin");
    if (!admin || submitting) return;
    try {
      if (await submit(admin.email, admin.password)) {
        window.location.assign("/admin");
      }
    } catch {
      onError();
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogin}
      disabled={submitting}
      className="mt-3 w-full rounded-control border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {t("signInModal.platformAdminQuickLogin")}
    </button>
  );
}
