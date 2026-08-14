"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useDropdown } from "@/hooks/useDropdown";
import { DropdownPanel } from "@/components/ui/Dropdown";
import { Button, buttonVariants } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/useT";
import { useCredentialsSignIn } from "@/hooks/useCredentialsSignIn";

/**
 * Compact "Join" popover — the header's sole logged-out entry point (top
 * right of the desktop nav). Real Auth.js credentials sign-in (real auth to
 * UI pass — see the "Rozaris Platform Audit" memory), same
 * `useCredentialsSignIn()` the global SignInModal uses, with a Sign Up link
 * into /buyer/signup below it.
 *
 * The full-screen SignInModal (openSignIn()) still exists and still backs
 * every OTHER "sign in required" prompt in the app (save/compare guards on
 * cards, listing detail, etc.) — this popover only replaces the header's
 * own entry point, which used to be a "Sign in" text link + "Create
 * account" pill.
 */
export function JoinMenu({ variant = "pill" }: { variant?: "pill" | "bare" }) {
  const { open, toggle, close, ref } = useDropdown<HTMLDivElement>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { submit, error, setError, submitting } = useCredentialsSignIn();
  const { t } = useT();

  function reset() {
    setUsername("");
    setPassword("");
    setError(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await submit(username.trim(), password);
    if (ok) {
      reset();
      close();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
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
        <DropdownPanel width="w-72" className="p-4">
          <form onSubmit={handleSubmit}>
            <label
              htmlFor="join-username"
              className="block text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              {t("signInModal.usernameLabel")}
            </label>
            <input
              id="join-username"
              type="email"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(false);
              }}
              placeholder={t("signInModal.usernamePlaceholder")}
              autoComplete="email"
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
              <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
                {t("signInModal.invalidCredentials")}
              </p>
            )}

            <Button type="submit" fullWidth disabled={!username.trim() || !password || submitting} className="mt-3">
              {t("common.signIn")}
            </Button>
          </form>

          <div className="my-3 h-px bg-neutral-100" />

          <Link href="/buyer/signup" onClick={close} className={buttonVariants({ variant: "secondary", fullWidth: true })}>
            {t("common.signUp")}
          </Link>
        </DropdownPanel>
      )}
    </div>
  );
}
