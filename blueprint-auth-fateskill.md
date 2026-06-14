# Blueprint: Sistema de Autenticação e Persistência de Utilizadores — FateSkill

## 1. Visão geral do que falta

Atualmente o schema Supabase já tem `profiles`, `skills`, `skill_stars`, `skill_installs`, `api_tokens` com RLS, mas a app web não tem: páginas de login/registo, client Supabase para o browser, middleware de sessão, proteção de rotas do dashboard, ligação de `author_id`/`user_id` aos endpoints de publish/star/download, e o CLI não tem fluxo de login real (OAuth/token).

Este blueprint cobre:

1. Auth Supabase (GitHub OAuth + magic link) no Next.js (App Router, `@supabase/ssr`)
2. Middleware de sessão
3. Páginas: `/login`, `/auth/callback`, proteção de `(dashboard)`
4. Endpoints API ligados ao utilizador autenticado (publish, star, download/install count)
5. Geração real de `api_tokens` (hash, scopes) ligados ao `user_id`
6. CLI: `fateskill login` via token real e `whoami` ligado ao Supabase

---

## 2. Dependências novas

```bash
pnpm --filter @fateskill/web add @supabase/ssr
```

---

## 3. Client Supabase (browser + server)

### `apps/web/lib/supabase-browser.ts`

```typescript
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### `apps/web/lib/supabase-server.ts`

```typescript
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // chamado de Server Component — middleware refresca a sessão
          }
        }
      }
    }
  );
}
```

### Atualizar `apps/web/.env.example`

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
SUPABASE_SKILL_PACKAGES_BUCKET=skill-packages
```

> A chave `anon` é pública (`NEXT_PUBLIC_*`), usada no browser/middleware com RLS. A `service_role` continua só em `lib/supabase.ts`, usada server-side para operações administrativas (bypassa RLS).

---

## 4. Middleware de sessão

### `apps/web/middleware.ts`

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();

  const protectedPrefixes = ["/dashboard", "/publish", "/settings"];
  const isProtected = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
```

---

## 5. Página de Login

### `apps/web/app/login/page.tsx`

```tsx
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
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
      }
    });
    if (signInError) setError(signInError.message);
  };

  const handleMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = getSupabaseBrowser();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
      }
    });

    if (otpError) {
      setError(otpError.message);
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
        <p style={{ color: "var(--brand)" }}>
          ✓ Verifica o teu email ({email}) e clica no link de acesso.
        </p>
      ) : (
        <form onSubmit={handleMagicLink} className="form-grid">
          <div className="field-row">
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@exemplo.com"
              disabled={status === "sending"}
            />
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
```

### `apps/web/app/auth/callback/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  if (code) {
    const supabase = await getSupabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${redirect}`);
}
```

---

## 6. Header com sessão (logout)

### `apps/web/app/layout.tsx` (atualizado)

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSupabaseServer } from "@/lib/supabase-server";
import { LogoutButton } from "@/components/logout-button";

export const metadata: Metadata = {
  title: "FateSkill",
  description: "Registo público e privado de Skills para IAs, com API e CLI."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="pt">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">FateSkill</Link>
          <nav>
            <Link href="/skills">Skills</Link>
            <Link href="/publish">Publicar</Link>
            <Link href="/dashboard">Dashboard</Link>
            {user ? (
              <>
                <Link href="/settings">{user.email}</Link>
                <LogoutButton />
              </>
            ) : (
              <Link href="/login">Entrar</Link>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

### `apps/web/components/logout-button.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <button onClick={handleLogout} className="button secondary" type="button">
      Sair
    </button>
  );
}
```

---

## 7. Garantir `profiles` ao iniciar sessão (trigger SQL)

### `supabase/migrations/0002_profile_on_signup.sql`

```sql
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'preferred_username',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

> Resolve colisões de `username` único: se houver conflito, podes adicionar lógica de sufixo no trigger (`username || '-' || substr(new.id::text,1,6)`), mas para o MVP `on conflict do nothing` evita falha de signup; o utilizador pode editar o `username` depois em `/settings`.

---

## 8. Endpoint `POST /api/v1/skills` ligado ao utilizador (author_id)

### `apps/web/lib/registry.ts` — alterar `publishSkill`

```typescript
import { getSupabaseAdmin } from "./supabase";

export async function publishSkill(input: unknown, userId?: string) {
  const payload = publishSkillSchema.parse(input);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      ...payload,
      slug: payload.name,
      downloads: 0,
      stars: 0,
      ai_targets: payload.ai,
      updated_at: new Date().toISOString(),
      dry_run: true
    };
  }

  if (!userId) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .upsert({
      name: payload.name,
      slug: payload.name,
      author_id: userId,
      description: payload.description,
      visibility: payload.visibility,
      category: payload.category,
      tags: payload.tags,
      ai_targets: payload.ai,
      repository: payload.repository ?? null,
      homepage: payload.homepage ?? null,
      updated_at: new Date().toISOString()
    }, { onConflict: "name" })
    .select("id,name,slug,author_id")
    .single();

  if (skillError) throw new Error(skillError.message);

  if (skill.author_id !== userId) {
    throw new Error("FORBIDDEN: skill já pertence a outro autor");
  }

  await supabase.from("skill_versions").update({ is_latest: false }).eq("skill_id", skill.id);
  const { error: versionError } = await supabase.from("skill_versions").upsert({
    skill_id: skill.id,
    version: payload.version,
    changelog: payload.changelog,
    file_url: payload.file_url ?? "https://example.invalid/upload-pending.skill",
    file_size: payload.file_size,
    is_latest: true
  }, { onConflict: "skill_id,version" });

  if (versionError) throw new Error(versionError.message);
  return { ...payload, slug: skill.slug };
}
```

### `apps/web/app/api/v1/skills/route.ts` (atualizado)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { listSkills, parseSearchParams, publishSkill } from "@/lib/registry";
import { resolveApiUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const result = await listSkills(parseSearchParams(request.nextUrl.searchParams));
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!auth.scopes.includes("publish")) {
    return NextResponse.json({ error: "Token missing 'publish' scope" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());

  const normalized = typeof body.tags === "string"
    ? { ...body, tags: body.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean) }
    : body;

  try {
    const skill = await publishSkill(normalized, auth.userId);
    return NextResponse.json(skill, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
```

---

## 9. Autenticação de API (cookie de sessão **ou** Bearer token)

### `apps/web/lib/auth.ts`

```typescript
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "./supabase";
import { getSupabaseServer } from "./supabase-server";

export type ApiAuth = {
  userId: string;
  scopes: string[];
  via: "cookie" | "token";
};

export async function resolveApiUser(request: NextRequest): Promise<ApiAuth | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice("Bearer ".length).trim();
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const { data, error } = await supabase
      .from("api_tokens")
      .select("user_id, scopes, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !data) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

    await supabase.from("api_tokens").update({ last_used: new Date().toISOString() }).eq("token_hash", tokenHash);

    return { userId: data.user_id, scopes: data.scopes ?? ["read"], via: "token" };
  }

  // Sessão de browser (cookies)
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return { userId: user.id, scopes: ["read", "publish", "admin"], via: "cookie" };
}
```

---

## 10. `POST /auth/token` real (criar token de API)

### `apps/web/app/api/v1/auth/token/route.ts` (substituir)

```typescript
import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveApiUser } from "@/lib/auth";

const ALLOWED_SCOPES = ["read", "publish", "admin"] as const;

export async function POST(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedScopes: string[] = Array.isArray(body.scopes) && body.scopes.length > 0
    ? body.scopes
    : ["read"];

  const scopes = requestedScopes.filter((scope) => (ALLOWED_SCOPES as readonly string[]).includes(scope));
  if (scopes.length === 0) {
    return NextResponse.json({ error: "Invalid scopes" }, { status: 400 });
  }

  // Só sessões de cookie (utilizador real) podem criar tokens 'admin'
  if (scopes.includes("admin") && auth.via !== "cookie") {
    return NextResponse.json({ error: "Only browser sessions can mint admin tokens" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const rawToken = `shb_${randomBytes(24).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const name = typeof body.name === "string" && body.name.length > 0 ? body.name : "default";
  const expiresAt = typeof body.expires_at === "string" ? body.expires_at : null;

  const { data, error } = await supabase
    .from("api_tokens")
    .insert({
      user_id: auth.userId,
      name,
      token_hash: tokenHash,
      scopes,
      expires_at: expiresAt
    })
    .select("id, name, scopes, created_at, expires_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    token: rawToken // mostrado UMA VEZ; o utilizador deve copiar agora
  }, { status: 201 });
}
```

> Adiciona `GET` (listar tokens sem o valor) e `DELETE /api/v1/auth/token/:id` (revoke) seguindo o mesmo padrão de `resolveApiUser`.

---

## 11. Star (gosto) ligado ao utilizador

### `apps/web/app/api/v1/skills/[name]/star/route.ts` (substituir)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveApiUser } from "@/lib/auth";
import { getSkill } from "@/lib/registry";

export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ name, starred: true, dry_run: true });
  }

  const skill = await getSkill(name);
  if (!skill?.id) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const { error: insertError } = await supabase
    .from("skill_stars")
    .insert({ user_id: auth.userId, skill_id: skill.id });

  if (insertError && insertError.code !== "23505") { // unique_violation = já tinha dado star
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase.rpc("increment_skill_stars", { p_skill_id: skill.id });

  return NextResponse.json({ name, starred: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ name, starred: false, dry_run: true });

  const skill = await getSkill(name);
  if (!skill?.id) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const { error: deleteError, count } = await supabase
    .from("skill_stars")
    .delete({ count: "exact" })
    .eq("user_id", auth.userId)
    .eq("skill_id", skill.id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (count && count > 0) {
    await supabase.rpc("decrement_skill_stars", { p_skill_id: skill.id });
  }

  return NextResponse.json({ name, starred: false });
}
```

### `supabase/migrations/0003_star_counters.sql`

```sql
create or replace function increment_skill_stars(p_skill_id uuid) returns void
language sql as $$
  update skills set stars = stars + 1 where id = p_skill_id;
$$;

create or replace function decrement_skill_stars(p_skill_id uuid) returns void
language sql as $$
  update skills set stars = greatest(stars - 1, 0) where id = p_skill_id;
$$;

create or replace function increment_skill_downloads(p_skill_id uuid) returns void
language sql as $$
  update skills set downloads = downloads + 1 where id = p_skill_id;
$$;
```

---

## 12. Contabilizar downloads (ligar `skill_installs` ao utilizador, se autenticado)

### `apps/web/app/api/v1/skills/[name]/download/route.ts` (substituir)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSkill } from "@/lib/registry";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveApiUser } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const skill = await getSkill(name);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const auth = await resolveApiUser(request).catch(() => null);
  const source = request.headers.get("user-agent")?.includes("fateskill-cli") ? "cli" : "api";

  const supabase = getSupabaseAdmin();
  if (supabase && skill.id && skill.version_id) {
    await supabase.from("skill_installs").insert({
      skill_id: skill.id,
      version_id: skill.version_id,
      user_id: auth?.userId ?? null,
      source
    });
    await supabase.rpc("increment_skill_downloads", { p_skill_id: skill.id });
  }

  if (skill.download_url.startsWith("http")) {
    return NextResponse.redirect(skill.download_url);
  }

  return new NextResponse(`FateSkill package placeholder for ${skill.name}@${skill.version}\n`, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${skill.name}-${skill.version}.skill"`
    }
  });
}
```

---

## 13. Dashboard real (skills do utilizador autenticado)

### `apps/web/app/(dashboard)/dashboard/page.tsx` (substituir)

```tsx
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = getSupabaseAdmin();
  let mySkills: { name: string; version: string; downloads: number; stars: number; visibility: string }[] = [];

  if (admin && user) {
    const { data } = await admin
      .from("skills")
      .select("name, downloads, stars, visibility, skill_versions!inner(version, is_latest)")
      .eq("author_id", user.id)
      .eq("skill_versions.is_latest", true);

    mySkills = (data ?? []).map((row) => ({
      name: row.name,
      version: (row.skill_versions as unknown as { version: string }[])[0]?.version ?? "—",
      downloads: row.downloads,
      stars: row.stars,
      visibility: row.visibility
    }));
  }

  return (
    <section className="container">
      <p className="eyebrow">Área autenticada</p>
      <h1>Dashboard do autor</h1>
      <p>Sessão: {user?.email ?? "anónimo (Supabase não configurado)"}</p>

      <div className="card-grid">
        {mySkills.length === 0 && <p>Ainda não publicaste nenhuma skill.</p>}
        {mySkills.map((skill) => (
          <Link key={skill.name} href={`/skills/${skill.name}`} className="card">
            <h3>{skill.name}@{skill.version}</h3>
            <p>Visibilidade: {skill.visibility}</p>
            <div className="stats"><span>↓ {skill.downloads}</span><span>★ {skill.stars}</span></div>
          </Link>
        ))}
      </div>

      <Link href="/publish" className="button" style={{ marginTop: "2rem" }}>Publicar nova skill</Link>
    </section>
  );
}
```

---

## 14. Settings: editar username + gerar tokens

### `apps/web/app/(dashboard)/settings/page.tsx` (substituir)

```tsx
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { TokenManager } from "@/components/token-manager";

export default async function SettingsPage() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = getSupabaseAdmin();
  let username = "";
  let tokens: { id: string; name: string; scopes: string[]; created_at: string }[] = [];

  if (admin && user) {
    const { data: profile } = await admin.from("profiles").select("username").eq("id", user.id).single();
    username = profile?.username ?? "";

    const { data: tokenRows } = await admin
      .from("api_tokens")
      .select("id, name, scopes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    tokens = tokenRows ?? [];
  }

  return (
    <section className="container">
      <p className="eyebrow">Configurações</p>
      <h1>Conta e tokens</h1>
      <p>Email: {user?.email}</p>
      <p>Username: @{username || "—"}</p>

      <h2>Tokens de API</h2>
      <TokenManager initialTokens={tokens} />
    </section>
  );
}
```

### `apps/web/components/token-manager.tsx`

```tsx
"use client";

import { useState } from "react";

type Token = { id: string; name: string; scopes: string[]; created_at: string };

export function TokenManager({ initialTokens }: { initialTokens: Token[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("publish");
  const [created, setCreated] = useState<string | null>(null);

  const createToken = async () => {
    const response = await fetch("/api/v1/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "default", scopes: [scope, "read"] })
    });
    const data = await response.json();
    if (response.ok) {
      setCreated(data.token);
      setTokens((previous) => [{ id: data.id, name: data.name, scopes: data.scopes, created_at: data.created_at }, ...previous]);
      setName("");
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

      {created && (
        <p style={{ color: "var(--brand)" }}>
          Token criado (copia agora, não será mostrado novamente): <code>{created}</code>
        </p>
      )}

      <ul>
        {tokens.map((token) => (
          <li key={token.id}>
            {token.name} — {token.scopes.join(", ")} — {new Date(token.created_at).toLocaleString("pt-PT")}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 15. CLI — login real com token gerado na web

O fluxo mais simples e seguro (sem OAuth device flow no CLI): o utilizador faz login na web → `/settings` → gera token com scope `publish` → cola no CLI.

### `packages/cli/src/commands/login.ts` (substituir)

```typescript
import { apiClient } from "../api-client.js";
import { loadConfig, saveConfig } from "../config.js";

export async function loginCommand(token?: string) {
  const config = await loadConfig();
  const authToken = token ?? process.env.FATESKILL_TOKEN;
  if (!authToken) {
    throw new Error(
      "Provide a token with --token or FATESKILL_TOKEN.\n" +
      "Generate one at https://fateskill.vercel.app/settings (scope: publish)."
    );
  }

  // valida o token chamando /auth/whoami
  config.auth_token = authToken;
  const client = await apiClient();
  try {
    const { data } = await client.get("/auth/whoami");
    await saveConfig(config);
    console.log(`✓ authenticated as @${data.username} (scopes: ${data.scopes.join(", ")})`);
  } catch {
    throw new Error("Invalid or expired token");
  }
}

export async function logoutCommand() {
  const config = await loadConfig();
  delete config.auth_token;
  await saveConfig(config);
  console.log("✓ logged out");
}

export async function whoamiCommand() {
  const config = await loadConfig();
  if (!config.auth_token) {
    console.log("Anonymous");
    console.log(`registry: ${config.registry}`);
    return;
  }
  const client = await apiClient();
  const { data } = await client.get("/auth/whoami");
  console.log(`@${data.username} (${data.scopes.join(", ")})`);
  console.log(`registry: ${config.registry}`);
}
```

### `apps/web/app/api/v1/auth/whoami/route.ts` (novo)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const admin = getSupabaseAdmin();
  let username = "anonymous";
  if (admin) {
    const { data } = await admin.from("profiles").select("username").eq("id", auth.userId).single();
    username = data?.username ?? "anonymous";
  }

  return NextResponse.json({ username, scopes: auth.scopes, via: auth.via });
}
```

---

## 16. Resumo das migrações novas

| Ficheiro | Conteúdo |
| --- | --- |
| `0002_profile_on_signup.sql` | Trigger que cria `profiles` automaticamente no signup |
| `0003_star_counters.sql` | RPCs `increment/decrement_skill_stars`, `increment_skill_downloads` |

---

## 17. Checklist de implementação

1. Ativar GitHub OAuth + Magic Link no Supabase Auth dashboard (Site URL + Redirect URLs incluindo `/auth/callback`)
2. Adicionar `NEXT_PUBLIC_SUPABASE_ANON_KEY` ao `.env.local` e ao Vercel
3. Correr migrações `0002` e `0003`
4. Adicionar ficheiros das secções 3–6 (clients, middleware, login, callback, header)
5. Atualizar `registry.ts`, `auth.ts`, e as rotas de `skills`, `star`, `download`, `auth/token`, `auth/whoami`
6. Atualizar dashboard/settings
7. Atualizar CLI `login.ts` (já chamado por `index.ts`, sem mudanças extra necessárias)
8. Testar fluxo: login GitHub → `/settings` cria token `publish` → `fateskill login --token shb_...` → `fateskill publish`
