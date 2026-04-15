"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "./Auth.module.css";

interface Props {
  onClose: () => void;
}

export default function Auth({ onClose }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else onClose();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account, then log in.");
    }
    setLoading(false);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>

        <h2 className={styles.title}>
          {mode === "login" ? "sign in" : "create account"}
        </h2>
        <p className={styles.subtitle}>
          {mode === "login"
            ? "sign in to save your grades"
            : "create an account to save your grades"}
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.input}
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className={styles.input}
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          {message && <p className={styles.success}>{message}</p>}
          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? "..." : mode === "login" ? "sign in" : "sign up"}
          </button>
        </form>

        <p className={styles.toggle}>
          {mode === "login" ? "don't have an account? " : "already have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>
            {mode === "login" ? "sign up" : "sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
