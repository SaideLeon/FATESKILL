"use client";

import { useState } from "react";

type Token = { id: string; name: string; scopes: string[]; created_at: string; expires_at?: string | null };

export function TokenManager({ initialTokens }: { initialTokens: Token[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("publish");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createToken = async () => {
    setError(null);
    const response = await fetch("/api/v1/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "default", scopes: Array.from(new Set([scope, "read"])) })
    });
    const data = await response.json();
    if (response.ok) {
      setCreated(data.token);
      setTokens((previous) => [{ id: data.id, name: data.name, scopes: data.scopes, created_at: data.created_at, expires_at: data.expires_at }, ...previous]);
      setName("");
    } else {
      setError(data.error ?? "Não foi possível criar o token");
    }
  };

  const revokeToken = async (id: string) => {
    setError(null);
    const response = await fetch(`/api/v1/auth/token/${id}`, { method: "DELETE" });
    if (response.ok) {
      setTokens((previous) => previous.filter((token) => token.id !== id));
    } else {
      setError("Não foi possível revogar o token");
    }
  };

  return (
    <div>
      <div className="form-grid" style={{ maxWidth: 480, marginBottom: "1rem" }}>
        <div className="field-row">
          <label>Nome do token</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="ex: cli-laptop" />
        </div>
        <div className="field-row">
          <label>Scope</label>
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="read">read</option>
            <option value="publish">publish</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button onClick={createToken} className="button" type="button">Criar token</button>
      </div>
      {created && <p style={{ color: "var(--brand)" }}>Token criado (copia agora, não será mostrado novamente): <code>{created}</code></p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      <ul>
        {tokens.map((token) => (
          <li key={token.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <span>
              {token.name} — {token.scopes.join(", ")} — criado {new Date(token.created_at).toLocaleString("pt-PT")}
              {token.expires_at && <> · expira {new Date(token.expires_at).toLocaleDateString("pt-PT")}</>}
            </span>
            <button onClick={() => revokeToken(token.id)} className="button secondary" type="button">Revogar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
