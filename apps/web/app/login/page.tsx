"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  const handleGithubLogin = async () => {
    const supabase = getSupabaseBrowser();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}` }
    });
    if (signInError) setError(signInError.message);
  };

  const handleMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    const response = await fetch("/api/v1/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}` })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "Não foi possível enviar o magic link");
      setStatus("error");
      return;
    }

    setStatus("sent");
  };

  return (
    <section className="container" style={{ maxWidth: 480 }}>
      <p className="eyebrow">Entrar</p>
      <h1>Acede ao FateSkill</h1>
      <button onClick={handleGithubLogin} className="button" type="button" style={{ width: "100%", justifyContent: "center", marginBottom: "1rem" }}>
        Continuar com GitHub
      </button>
      <div style={{ textAlign: "center", color: "var(--muted)", margin: "1rem 0" }}>ou</div>
      {status === "sent" ? (
        <p style={{ color: "var(--brand)" }}>✓ Verifica o teu email ({email}) e clica no link de acesso.</p>
      ) : (
        <form onSubmit={handleMagicLink} className="form-grid">
          <div className="field-row">
            <label>Email</label>
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@exemplo.com" disabled={status === "sending"} />
          </div>
          <button type="submit" className="button secondary" disabled={status === "sending"} style={{ width: "100%", justifyContent: "center" }}>
            {status === "sending" ? "A enviar…" : "Enviar magic link"}
          </button>
        </form>
      )}
      {error && <p style={{ color: "#f87171", marginTop: "1rem" }}>{error}</p>}
    </section>
  );
}
