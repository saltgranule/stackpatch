import { useState } from "react";
import type { AuthUser } from "@stackpatch/shared";
import { login } from "../../api/client";
import form from "../../styles/consoleForm.module.css";
import { ConsoleCard, ConsoleTabLabel } from "../ConsoleCard";
import styles from "./Login.module.css";

const BRAND_BANNER_SRC = "/assets/1000x3000.png";

interface LoginProps {
  onLogin: (user: AuthUser) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const user = await login(username.trim(), password);
      onLogin(user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <img src={BRAND_BANNER_SRC} alt="stackpatch" className={styles.brandBanner} />

        <ConsoleCard
          tabLabel={<ConsoleTabLabel dot="running">sign in</ConsoleTabLabel>}
          hint="Default: admin / changeme"
        >
          <form className={form.form} onSubmit={handleSubmit}>
            <label className={form.field}>
              <span className={form.fieldLabel}>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
                autoComplete="username"
                required
              />
            </label>

            <label className={form.field}>
              <span className={form.fieldLabel}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </label>

            {error && <p className={`${form.feedback} ${form.error}`}>{error}</p>}

            <div className={form.actions}>
              <button type="submit" className={form.actionPrimary} disabled={submitting}>
                {submitting ? "Signing In…" : "Sign In"}
              </button>
            </div>
          </form>
        </ConsoleCard>
      </div>
    </div>
  );
}
