import { useState } from "react";
import type { AuthUser } from "@stackpatch/shared";
import { login } from "../../api/client";
import { BrandLogo } from "../BrandLogo/BrandLogo";
import styles from "./Login.module.css";

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
      <p className={styles.defaultHint}>Default: admin / changeme</p>
      <form className={styles.card} onSubmit={handleSubmit}>
        <BrandLogo size="lg" align="left" />

        <input
          className={styles.input}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          autoComplete="username"
          required
        />

        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          required
        />

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.button} disabled={submitting}>
          {submitting ? "Signing In…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
