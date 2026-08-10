"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useT } from "@/lib/i18n/useT";
import { findDemoAccount } from "@/lib/demoAccounts";

/**
 * Compact "Join" popover — the header's sole logged-out entry point (top
 * right of the desktop nav). Inline sign-in (username/password, same demo
 * account validation as the global SignInModal) with a Sign Up link into
 * /buyer/signup below it.
 *
 * The full-screen SignInModal (openSignIn()) still exists and still backs
 * every OTHER "sign in required" prompt in the app (save/compare guards on
 * cards, listing detail, etc.) — this popover only replaces the header's
 * own entry point, which used to be a "Sign in" text link + "Create
 * account" pill.
 */
export function JoinMenu({ variant = "pill" }: { variant?: "pill" | "bare" }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const signIn = useAppStore((s) => s.signIn);
  const { t } = useT();
  useClickOutside(ref, () => setOpen(false), open);

  function reset() {
    setUsername("");
    setPassword("");
    setError(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const account = findDemoAccount(username, password);
    if (!account) {
      setError(true);
      return;
    }
    signIn(account.displayName, account.role, account.orgType, account.publisherId);
    reset();
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          variant === "bare"
            ? "flex min-h-11 min-w-11 items-center justify-center text-sm text-white outline-offset-4 [mix-blend-mode:difference]"
            : "rounded-pill bg-neutral-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-neutral-800"
        }
      >
        {variant === "bare" ? t("common.signIn") : t("common.join")}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-card border border-neutral-200 bg-white p-4 shadow-[var(--shadow-2)]">
          <form onSubmit={handleSubmit}>
            <label
              htmlFor="join-username"
              className="block text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              {t("signInModal.usernameLabel")}
            </label>
            <input
              id="join-username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(false);
              }}
              placeholder={t("signInModal.usernamePlaceholder")}
              autoComplete="username"
              className="mt-1.5 w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />

            <label
              htmlFor="join-password"
              className="mt-3 block text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              {t("signInModal.passwordLabel")}
            </label>
            <input
              id="join-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder={t("signInModal.passwordPlaceholder")}
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
            {error && (
              <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
                {t("signInModal.invalidCredentials")}
              </p>
            )}

            <button
              type="submit"
              disabled={!username.trim() || !password}
              className="mt-3 w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.signIn")}
            </button>
          </form>

          <div className="my-3 h-px bg-neutral-100" />

          <Link
            href="/buyer/signup"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-center rounded-control border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            {t("common.signUp")}
          </Link>
        </div>
      )}
    </div>
  );
}
