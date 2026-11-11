"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Footer } from "@/components/layout/Footer";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/release-flags";
import { UnifiedLoginFrame } from "@/components/auth/UnifiedLoginFrame";
import styles from "@/components/auth/UnifiedLoginFrame.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await authApi.login(form.email, form.password);
      auth.setTokens(tokens.access_token, tokens.refresh_token);
      const user = auth.getUser();
      const next = new URLSearchParams(window.location.search).get("next");
      // Only honor the two explicitly auth-gated legacy feature routes.
      const requestedRoute = next === "/home" || next === "/market" ? next : null;
      if (requestedRoute && user?.role === "candidate") {
        router.push(requestedRoute);
      } else if (user?.role === "worker") {
        router.push("/worker");
      } else if (user?.role === "admin" && !user.tenant_id) {
        router.push("/admin");
      } else if (user?.role === "recruiter" || user?.role === "admin") {
        router.push("/dashboard");
      } else if (user?.role === "support") {
        router.push("/support");
      } else {
        router.push("/profile");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("E-Mail oder Passwort falsch.");
      } else if (err instanceof ApiError) {
        setError(err.detail || "Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
      } else {
        setError("Server nicht erreichbar. Bitte versuche es erneut.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <UnifiedLoginFrame>
        <h1>Willkommen zurück</h1>
        <p className={styles.description}>Melde dich an, um in deinem Arbeitsbereich weiterzuarbeiten.</p>
        <div className={styles.slot}>

        {error && (
          <div role="alert" className={styles.alert}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form} aria-busy={loading}>
          <label className={styles.field} htmlFor="login-email">
              E-Mail
            <input
              id="login-email"
              autoComplete="username"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@beispiel.de"
            />
          </label>

          <label className={styles.field} htmlFor="login-password">
              Passwort
            <input
              type="password"
              id="login-password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Passwort"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className={styles.submit}
          >
            {loading ? "Wird angemeldet…" : "Anmelden"}
          </button>
        </form>

        <div className={styles.links}>
          <Link href="/forgot-password" className={styles.link}>
            Passwort vergessen?
          </Link>

        {PUBLIC_REGISTRATION_ENABLED ? <p>
          Noch kein Konto?{" "}
          <Link href="/register" className={styles.link}>
            Jetzt registrieren
          </Link>
        </p> : <p>
          Der Zugang erfolgt über ein bereits eingerichtetes Pilotkonto. Die öffentliche Registrierung ist noch geschlossen.
        </p>}
        </div>
        </div>
      </UnifiedLoginFrame>
      <Footer />
    </div>
  );
}
