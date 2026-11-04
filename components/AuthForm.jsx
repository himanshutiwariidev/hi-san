"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, errorMessage } from "@/lib/api";
import PrimaryButton from "@/components/ui/PrimaryButton";

function Field({ label, ...inputProps }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <input
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5"
        {...inputProps}
      />
    </label>
  );
}

export default function AuthForm({ mode }) {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);
  const isLogin = mode === "login";

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email    = String(form.get("email")    ?? "").trim();
    const password = String(form.get("password") ?? "").trim();

    // ── Client-side validation ──────────────────────────────────────────────
    if (!email) {
      setError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setWorking(true);
    try {
      if (isLogin) {
        await apiClient.login({ email, password });
        router.push(new URLSearchParams(window.location.search).get("next") ?? "/");
        return;
      }

      const displayName  = String(form.get("display_name")  ?? "").trim();
      const tenantName   = String(form.get("tenant_name")   ?? "").trim();
      const businessName = String(form.get("business_name") ?? "").trim();

      if (!displayName)  { setError("Full name is required.");       setWorking(false); return; }
      if (!tenantName)   { setError("Organization is required.");    setWorking(false); return; }
      if (!businessName) { setError("Business name is required.");   setWorking(false); return; }

      await apiClient.signup({ email, password, display_name: displayName, tenant_name: tenantName, business_name: businessName });
      router.push("/extension");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form className="grid gap-3.5" onSubmit={handleSubmit}>
      {!isLogin && (
        <>
          <Field label="Full name" name="display_name" required autoComplete="name" />
          <Field label="Organization" name="tenant_name" required autoComplete="organization" />
          <Field label="Business name" name="business_name" required />
        </>
      )}
      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete={isLogin ? "current-password" : "new-password"}
      />
      {error ? <p className="m-0 text-danger">{error}</p> : null}
      <PrimaryButton disabled={working} type="submit">
        {working ? "Working..." : isLogin ? "Login" : "Create account"}
      </PrimaryButton>
    </form>
  );
}
