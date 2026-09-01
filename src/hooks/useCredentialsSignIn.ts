"use client";

import { useState } from "react";
import { signIn as nextAuthSignIn } from "next-auth/react";

export function useCredentialsSignIn() {
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(email: string, password: string): Promise<boolean> {
    setSubmitting(true);
    setError(false);
    try {
      const result = await nextAuthSignIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        setError(true);
        return false;
      }
      return true;
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, error, setError, submitting };
}
