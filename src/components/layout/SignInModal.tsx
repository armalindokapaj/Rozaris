"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { useCredentialsSignIn } from "@/hooks/useCredentialsSignIn";
import { DEMO_ACCOUNTS } from "@/lib/demoAccounts";

export function SignInModal() {
  const open = useAppStore((s) => s.signInModalOpen);
  const closeSignIn = useAppStore((s) => s.closeSignIn);
  const { submit, error, setError, submitting } = useCredentialsSignIn();
  const { t } = useT();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
    }
  }, [open]);

  function reset() {
    setUsername("");
    setPassword("");
    setError(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeSignIn();
        setUsername("");
        setPassword("");
        setError(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeSignIn, setError]);

  if (!open) return null;

  const canSubmit = username.trim().length > 0 && password.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const ok = await submit(username.trim(), password);
    if (ok) {
      closeSignIn();
      reset();
    }
  }

  function handleClose() {
    closeSignIn();
    reset();
  }

  function fillDemo(u: string) {
    setUsername(u);
    setPassword("1");
    setError(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal aria-labelledby="signin-modal-title">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={handleClose}
        className="absolute inset-0 bg-[rgba(15,15,20,0.28)]"
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-panel bg-white p-5 shadow-[var(--shadow-3)]"
      >
        <h2 id="signin-modal-title" className="text-base font-bold text-neutral-900">
          {t("signInModal.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">{t("signInModal.subtitle")}</p>

        <label htmlFor="signin-username" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("signInModal.usernameLabel")}
        </label>
        <input
          id="signin-username"
          type="email"
          ref={inputRef}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(false);
          }}
          placeholder={t("signInModal.usernamePlaceholder")}
          autoComplete="email"
          className="mt-1.5 w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        />

        <label htmlFor="signin-password" className="mt-3 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("signInModal.passwordLabel")}
        </label>
        <input
          id="signin-password"
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

        {                                                                 
                                              }
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("signInModal.demoAccounts")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {                                                         
                                                   }
              {DEMO_ACCOUNTS.filter((a) => a.typeLabel !== "Admin").map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => fillDemo(a.email)}
                  title={a.typeLabel}
                  className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                >
                  {a.displayName}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-neutral-400">{t("signInModal.mockNote")}</p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-control border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="flex-1 rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("signInModal.continue")}
          </button>
        </div>
      </form>
    </div>
  );
}
