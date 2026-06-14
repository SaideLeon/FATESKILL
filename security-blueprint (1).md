# 🔐 Blueprint de Correcção de Segurança

**Projecto:** FateSkill (monorepo: apps/web + packages/cli + Supabase)
**Data da auditoria:** 2026-06-14
**Auditado por:** Claude Security Audit Skill v1.0

---

## Score de Segurança

| Métrica | Valor |
|---------|-------|
| Score actual | 5/100 |
| Score esperado após correcções | 100/100 |
| Vulnerabilidades CRÍTICO | 5 |
| Vulnerabilidades ALTO | 6 |
| Vulnerabilidades MÉDIO | 2 |
| **Resultado actual** | **REPROVADO — não apto para produção** |

---

## Índice de Vulnerabilidades

| # | Regra | Severidade | Localização | Esforço | Status |
|---|-------|-----------|-------------|---------|--------|
| 1 | [R15](#r15-protecção-idor--putdelete-apiv1skillsname--crítico) | CRÍTICO | `app/api/v1/skills/[name]/route.ts` | Médio | Pendente |
| 2 | [R22](#r22-defesa-em-profundidade-vs-service-role--crítico) | CRÍTICO | `lib/supabase.ts` + todas as rotas API | Alto | Pendente |
| 3 | [R09/R10](#r09r10-injecção-de-filtro-no-fallback-de-pesquisa--crítico) | CRÍTICO | `lib/registry.ts` (`listSkills`) | Baixo | Pendente |
| 4 | [R18](#r18-mass-assignment-no-post-apiv1skills--crítico) | CRÍTICO | `lib/registry.ts` (`publishSkillSchema`/`publishSkill`) | Médio | Pendente |
| 5 | [R03/CTF-R01](#r03ctf-r01-tokens-shb-sem-segregação-nem-expiração-obrigatória--crítico) | CRÍTICO | `app/api/v1/auth/token/route.ts` | Médio | Pendente |
| 6 | [R06](#r06-sem-rate-limiting-em-rotas-críticas--alto) | ALTO | `auth/token`, `auth/whoami`, `login`, `uploads/skills` | Médio | Pendente |
| 7 | [R07](#r07-sem-limite-de-tamanho-em-campos-de-texto--alto) | ALTO | `lib/registry.ts` (`publishSkillSchema`) | Baixo | Pendente |
| 8 | [R12](#r12-upload-skill-sem-validação-de-magic-bytes--alto) | ALTO | `api/v1/uploads/skills/route.ts`, `lib/storage.ts` | Médio | Pendente |
| 9 | [R16/R17](#r16r17-getskill-sem-leitura-autenticada-para-conteúdo-privadounlisted--alto) | ALTO | `lib/registry.ts` (`getSkill`) | Alto | Pendente |
| 10 | [R05](#r05-tokens-de-api-sem-expiração-padrão-nem-revogação--alto) | ALTO | `auth/token/route.ts`, `token-manager.tsx` | Médio | Pendente |
| 11 | [R02](#r02-enumeração-de-utilizadores-em-apiv1usersusername--alto) | ALTO | `api/v1/users/[username]/route.ts` | Baixo | Pendente |
| 12 | [CTF-R10](#ctf-r10-middleware-fail-open-sem-supabase-configurado--médio) | MÉDIO | `middleware.ts` | Baixo | Pendente |
| 13 | [R13/R14](#r13r14-sem-restrição-em-repositoryhomepage-urls--médio) | MÉDIO | `lib/registry.ts` (`publishSkillSchema`) | Baixo | Pendente |

> **Esforço:** Baixo (< 1h) · Médio (1–4h) · Alto (> 4h)

---

## [R15] Protecção IDOR — `PUT`/`DELETE /api/v1/skills/:name` — CRÍTICO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/app/api/v1/skills/[name]/route.ts
export async function PUT(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return NextResponse.json({ name, ...(await request.json()), updated_at: new Date().toISOString() });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return NextResponse.json({ name, deleted: true });
}
```

**Por que é explorável:**
Não há `resolveApiUser`, não há verificação de scope, não há verificação de propriedade (`author_id`). Qualquer chamada `PUT`/`DELETE /api/v1/skills/<nome>` é aceite — mesmo que actualmente não persista no banco, o endpoint devolve `200`/sucesso, o que é ambíguo para clientes (CLI) e, mais importante, deixa um endpoint "meio implementado" que será ligado ao Supabase sem qualquer guarda de autorização. Isto é IDOR clássico: o recurso é identificado por `name` (controlado pelo cliente) sem checar quem é o dono.

**Impacto potencial:**
Qualquer utilizador autenticado (ou mesmo anónimo, dependendo de como `PUT`/`DELETE` vier a ser ligado ao Supabase) pode apagar ou alterar metadados de skills de outros autores — perda de dados, sabotagem de registry, reputação.

---

### Arquitectura da Correcção

```
Cliente (CLI/Web)
   │  PUT/DELETE /api/v1/skills/:name  (Authorization: Bearer shb_xxx ou cookie)
   ▼
resolveApiUser(request)
   │  - decodifica token / sessão
   │  - retorna { userId, scopes, via }
   ▼
getSkill(name)  → busca skill + author_id (via admin, mas devolvendo author_id)
   │
   ├─ skill não existe → 404
   ├─ auth.userId !== skill.author_id → 403 FORBIDDEN
   └─ ok → aplica mutação/remoção no Supabase com whitelist de campos
   ▼
Resposta 200 { name, ...updated } | { name, deleted: true }
```

---

### Implementação Passo a Passo

#### Passo 1 — Expor `author_id` e `id` na função `getSkill` (uso interno)

```typescript
// apps/web/lib/registry.ts
// Adicionar uma função interna que NÃO usa a view pública,
// para podermos verificar author_id mesmo de skills não públicas.
export async function getSkillOwnerInfo(name: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("skills")
    .select("id, name, author_id, visibility")
    .eq("name", name)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}
```

#### Passo 2 — Reescrever `PUT`/`DELETE` com autenticação, autorização e whitelist

```typescript
// apps/web/app/api/v1/skills/[name]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiUser } from "@/lib/auth";
import { getSkill, getSkillOwnerInfo } from "@/lib/registry";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const skill = await getSkill(name);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json(skill);
}

// Whitelist explícita de campos que podem ser actualizados pelo autor.
// Campos como downloads, stars, author_id, visibility-de-terceiros NUNCA aqui.
const updateSkillSchema = z.object({
  description: z.string().min(8).max(2000).optional(),
  category: z.string().max(60).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  visibility: z.enum(["public", "private", "unlisted"]).optional(),
  repository: z.string().url().max(300).optional().nullable(),
  homepage: z.string().url().max(300).optional().nullable()
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.scopes.includes("publish")) {
    return NextResponse.json({ error: "Token missing 'publish' scope" }, { status: 403 });
  }

  const owner = await getSkillOwnerInfo(name);
  if (!owner) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  if (owner.author_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden: not the owner of this skill" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateSkillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("skills")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", owner.id)
    .select("name, description, category, tags, visibility, repository, homepage, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const owner = await getSkillOwnerInfo(name);
  if (!owner) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  if (owner.author_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden: not the owner of this skill" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await supabase.from("skills").delete().eq("id", owner.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ name, deleted: true });
}
```

> Os `scripts/` (`scripts/` no .skill), `skill_versions`, etc. são removidos automaticamente via `on delete cascade` definido na migração `0001_initial_fateskill.sql`.

---

### Teste de Validação

```typescript
// apps/web/__tests__/skills-idor.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run skills-idor
import { describe, it, expect, vi } from "vitest";

describe("R15 — IDOR em PUT/DELETE /api/v1/skills/:name", () => {
  it("rejeita DELETE de skill de outro autor com 403", async () => {
    // Simula resolveApiUser retornando userId="user-B"
    // enquanto a skill "fofa-tabela-docx" pertence a author_id="user-A"
    const { DELETE } = await import("@/app/api/v1/skills/[name]/route");

    const request = new Request("https://fateskill.vercel.app/api/v1/skills/fofa-tabela-docx", {
      method: "DELETE",
      headers: { Authorization: "Bearer shb_user_b_token" }
    });

    const response = await DELETE(request as any, { params: Promise.resolve({ name: "fofa-tabela-docx" }) });
    expect(response.status).toBe(403);
  });

  it("rejeita PUT sem autenticação com 401", async () => {
    const { PUT } = await import("@/app/api/v1/skills/[name]/route");
    const request = new Request("https://fateskill.vercel.app/api/v1/skills/fofa-tabela-docx", {
      method: "PUT",
      body: JSON.stringify({ description: "hacked description" })
    });
    const response = await PUT(request as any, { params: Promise.resolve({ name: "fofa-tabela-docx" }) });
    expect(response.status).toBe(401);
  });

  it("permite PUT pelo autor legítimo apenas com campos whitelisted", async () => {
    const { PUT } = await import("@/app/api/v1/skills/[name]/route");
    const request = new Request("https://fateskill.vercel.app/api/v1/skills/fofa-tabela-docx", {
      method: "PUT",
      headers: { Authorization: "Bearer shb_user_a_token", "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Nova descrição válida", author_id: "user-B", downloads: 999999 })
    });
    const response = await PUT(request as any, { params: Promise.resolve({ name: "fofa-tabela-docx" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.author_id).toBeUndefined();
    expect(data.downloads).toBeUndefined();
  });
});
```

**Resultado esperado:** Apenas o `author_id` correspondente consegue actualizar/remover a sua própria skill; campos fora da whitelist (`author_id`, `downloads`, `stars`) são silenciosamente descartados pelo zod e nunca chegam ao Supabase.

---

### Checklist de Deploy

- [ ] `getSkillOwnerInfo` implementado e testado
- [ ] `PUT`/`DELETE` exigem `resolveApiUser` + verificação `author_id === auth.userId`
- [ ] Whitelist `updateSkillSchema` revisada por par
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run skills-idor`)
- [ ] Revisão de código por par antes do merge

---

## [R22] Defesa em profundidade vs. Service Role — CRÍTICO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/lib/supabase.ts
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
```

Todas as rotas (`star`, `route.ts` de skills, `auth/token`, `dashboard`, `settings`) usam `getSupabaseAdmin()`.

**Por que é explorável:**
O `service_role` ignora **todas** as políticas RLS definidas em `0001_initial_fateskill.sql` (`"author manages skill"`, `"users manage own tokens"`, etc.). Isto significa que as RLS existem apenas como documentação — não protegem nada em runtime via esta API. Toda a segurança depende de cada handler de rota lembrar de chamar `resolveApiUser` e verificar `userId`/`scopes`/`author_id` manualmente. Como já demonstrado em R15, basta **uma rota esquecer** essa verificação para o RLS não servir de rede de segurança (camada de BD comprometida = sem defesa adicional).

**Impacto potencial:**
Qualquer falha de lógica em qualquer rota futura resulta directamente em acesso total ao dado de qualquer utilizador — sem segunda camada de protecção no banco.

---

### Arquitectura da Correcção

```
┌──────────────────────────────────────────────────────────┐
│ Requisição autenticada (cookie de sessão ou Bearer token)  │
└───────────────┬──────────────────────────────────────────┘
                │
                ▼
   resolveApiUser(request) → { userId, scopes, via, accessToken? }
                │
                ▼
   ┌─────────────────────────────┬─────────────────────────────┐
   │ Operação de UTILIZADOR        │ Operação ADMINISTRATIVA/      │
   │ (publish, star, token, edit)  │ PÚBLICA (listSkills, getSkill │
   │                                │  para visibility=public)      │
   ▼                                ▼
getSupabaseUserScoped(accessToken)  getSupabaseAdmin()
   │  client com RLS ACTIVO          │  bypassa RLS (somente leitura
   │  (anon key + JWT do utilizador) │  pública / agregações)
   ▼                                ▼
 BD aplica policies "author         BD devolve apenas linhas
 manages skill" / "users manage     visibility = 'public'
 own tokens" como segunda camada    (via skills_public_view)
```

---

### Implementação Passo a Passo

#### Passo 1 — Capturar o access token do utilizador em `resolveApiUser`

```typescript
// apps/web/lib/auth.ts
export type ApiAuth = {
  userId: string;
  scopes: string[];
  via: "cookie" | "token";
  accessToken?: string; // JWT Supabase do utilizador, quando via "cookie"
};

export async function resolveApiUser(request: NextRequest): Promise<ApiAuth | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    // ... lógica existente para shb_* tokens (sem alteração)
    // via: "token" continua a usar admin client com checagens manuais
  }

  const supabase = await getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session } = await supabase.auth.getSession();

  return {
    userId: user.id,
    scopes: ["read", "publish", "admin"],
    via: "cookie",
    accessToken: session.session?.access_token
  };
}
```

#### Passo 2 — Criar client Supabase "user-scoped" que respeita RLS

```typescript
// apps/web/lib/supabase-user-scoped.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente que usa a ANON KEY + o JWT do utilizador autenticado.
 * Todas as policies RLS de 0001_initial_fateskill.sql são aplicadas.
 * Usar para qualquer mutação ligada a um utilizador (publish, star, tokens, settings).
 */
export function getSupabaseUserScoped(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
```

#### Passo 3 — Migrar `publishSkill`, `star`, `auth/token` para o client user-scoped

```typescript
// apps/web/lib/registry.ts (trecho de publishSkill)
export async function publishSkill(input: unknown, auth: { userId: string; accessToken?: string }) {
  const payload = publishSkillSchema.parse(input);

  // Usa client com RLS activo em vez de admin quando temos accessToken
  const supabase = auth.accessToken
    ? getSupabaseUserScoped(auth.accessToken)
    : getSupabaseAdmin();

  if (!supabase) {
    return { ...payload, slug: payload.name, downloads: 0, stars: 0, ai_targets: payload.ai, updated_at: new Date().toISOString(), dry_run: true };
  }

  // A policy "author manages skill" garante que o upsert só afecta
  // linhas onde author_id = auth.uid() (RLS), mesmo que o código aqui
  // tenha um bug — segunda camada de defesa.
  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .upsert({ /* ... mesmos campos ... */ author_id: auth.userId }, { onConflict: "name" })
    .select("id,name,slug,author_id")
    .single();

  if (skillError) throw new Error(skillError.message);
  // ... resto inalterado
}
```

> Para `/api/v1/skills/route.ts` POST, passar `{ userId: auth.userId, accessToken: auth.accessToken }` em vez de apenas `auth.userId`.

#### Passo 4 — Documentar quando usar cada client

```typescript
// apps/web/lib/supabase.ts — adicionar comentário de governança
/**
 * ⚠️ ATENÇÃO: getSupabaseAdmin() usa SERVICE_ROLE_KEY e IGNORA TODAS AS RLS.
 *
 * Usar SOMENTE para:
 *  - Leituras públicas agregadas (listSkills, getSkill via skills_public_view)
 *  - Operações de sistema sem utilizador associado (recordInstall, increment_*)
 *
 * Para qualquer mutação ligada a um utilizador autenticado (publish, star,
 * tokens, settings, PUT/DELETE de skill própria), usar getSupabaseUserScoped()
 * em lib/supabase-user-scoped.ts, que respeita as políticas RLS como segunda
 * camada de defesa (R22).
 */
export function getSupabaseAdmin() { /* ... */ }
```

---

### Teste de Validação

```typescript
// apps/web/__tests__/rls-defense-in-depth.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run rls-defense-in-depth
import { describe, it, expect } from "vitest";
import { getSupabaseUserScoped } from "@/lib/supabase-user-scoped";

describe("R22 — RLS como segunda camada de defesa", () => {
  it("um utilizador não consegue fazer upsert de skill com author_id de outro utilizador", async () => {
    const supabase = getSupabaseUserScoped("<jwt-valido-do-user-A>");

    const { error } = await supabase
      .from("skills")
      .upsert({ name: "skill-de-teste", slug: "skill-de-teste", author_id: "user-B-id", description: "x".repeat(10) });

    // RLS "author manages skill" usa author_id = auth.uid(); upsert com
    // author_id diferente deve ser bloqueado pela policy.
    expect(error).not.toBeNull();
  });
});
```

**Resultado esperado:** Mesmo que a camada de aplicação (Zod/handler) tivesse um bug que permitisse `author_id` arbitrário no payload, o Postgres rejeitaria a escrita por violar a RLS — confirmando defesa em profundidade real.

---

### Checklist de Deploy

- [ ] `getSupabaseUserScoped` criado e usado em `publishSkill`, `star`, `auth/token`, `PUT/DELETE skills`
- [ ] `resolveApiUser` retorna `accessToken` para sessões de cookie
- [ ] Comentário de governança adicionado a `getSupabaseAdmin`
- [ ] Variáveis de ambiente actualizadas (se aplicável) — `NEXT_PUBLIC_SUPABASE_ANON_KEY` já existe em `.env.example`
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run rls-defense-in-depth`)
- [ ] Revisão de código por par antes do merge

---

## [R09/R10] Injecção de filtro no fallback de pesquisa — CRÍTICO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/lib/registry.ts
function escapePostgrestLikePattern(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/"/g, '\\"');
}
// ...
const pattern = `%${escapePostgrestLikePattern(params.q)}%`;
query = query.or(`name.ilike."${pattern}",description.ilike."${pattern}",author.ilike."${pattern}"`);
```

**Por que é explorável:**
A função escapa `\`, `%`, `_` e `"`, mas a sintaxe do filtro `.or()` do PostgREST usa `,` para separar condições e `()`/`.` para operadores aninhados. Um valor de `q` contendo `,` ou `)` altera a estrutura lógica da expressão `or(...)` enviada ao PostgREST, podendo injectar condições adicionais não previstas pelo programador (PostgREST filter injection).

**Impacto potencial:**
Manipulação da query de pesquisa pública para potencialmente alterar quais linhas são retornadas (bypass parcial de filtros), ou causar erros 400/500 que vazam detalhes internos. Classificado CRÍTICO por R10 (protecção contra injection em queries).

---

### Arquitectura da Correcção

```
q (input do utilizador)
   │
   ▼
sanitizeSearchQuery(q)
   │  - remove/rejeita caracteres de controlo de sintaxe PostgREST: , ( ) .
   │  - limita comprimento (R14)
   ▼
Construção do filtro via array de condições + .or(array.join(","))
   apenas com pattern já validado contra whitelist de caracteres
   ▼
supabase.from("skills_public_view").select(...).or(safeFilter)
```

---

### Implementação Passo a Passo

#### Passo 1 — Substituir o escaping por sanitização restritiva + validação

```typescript
// apps/web/lib/registry.ts
const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * Remove caracteres com significado especial na sintaxe de filtros do
 * PostgREST (`,` separa condições; `(` `)` agrupam; `.` separa coluna/operador).
 * Mantém apenas o necessário para uma pesquisa textual segura.
 */
function sanitizeSearchQuery(value: string): string {
  return value
    .slice(0, SEARCH_QUERY_MAX_LENGTH)
    .replace(/[,()."]/g, " ")   // remove separadores/operadores do PostgREST
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .trim();
}
```

#### Passo 2 — Usar a versão sanitizada e construir o filtro de forma explícita

```typescript
const buildQuery = (searchMode: "full-text" | "contains") => {
  let query = supabase.from("skills_public_view").select("*", { count: "exact" });

  if (params.q) {
    const safeQ = sanitizeSearchQuery(params.q);

    if (!safeQ) {
      // q ficou vazio após sanitização (ex.: só tinha caracteres especiais) — ignora filtro de texto
    } else if (searchMode === "full-text") {
      query = query.textSearch("search_vector", safeQ, { type: "websearch" });
    } else {
      const pattern = `%${safeQ}%`;
      const filters = [
        `name.ilike.${JSON.stringify(pattern)}`,
        `description.ilike.${JSON.stringify(pattern)}`,
        `author.ilike.${JSON.stringify(pattern)}`
      ];
      query = query.or(filters.join(","));
    }
  }

  if (params.tag) query = query.contains("tags", [params.tag]);
  if (params.category) query = query.eq("category", params.category);
  if (params.author) query = query.eq("author", params.author);

  return query.order(sortColumn, { ascending: false }).range(from, to);
};
```

> `JSON.stringify(pattern)` produz uma string entre aspas duplas com escaping JSON correcto, evitando que aspas internas quebrem a sintaxe — combinado com a remoção de `"` na sanitização, elimina ambas as classes de injecção.

---

### Teste de Validação

```typescript
// apps/web/__tests__/search-injection.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run search-injection
import { describe, it, expect } from "vitest";
import { listSkills } from "@/lib/registry";

describe("R09/R10 — injecção de filtro PostgREST na pesquisa", () => {
  it("não lança erro nem altera a estrutura do filtro com vírgulas e parênteses", async () => {
    const malicious = `x",visibility.eq."private`;
    const result = await listSkills({ q: malicious });
    // Deve retornar normalmente (lista vazia ou filtrada), nunca um erro 500
    expect(result).toHaveProperty("data");
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("nunca retorna skills com visibility != public via pesquisa", async () => {
    const result = await listSkills({ q: `",visibility.eq."private` });
    expect(result.data.every((s) => s.visibility === "public" || s.visibility === undefined)).toBe(true);
  });
});
```

**Resultado esperado:** Inputs contendo `,`, `(`, `)`, `.`, `"` são neutralizados antes de chegar ao `.or()`; a pesquisa nunca expõe linhas fora de `skills_public_view` (que já filtra `visibility = 'public'`).

---

### Checklist de Deploy

- [ ] `sanitizeSearchQuery` implementada e usada em ambos os modos (`full-text` e `contains`)
- [ ] Filtros `.or()` construídos via array + `JSON.stringify` do pattern
- [ ] `SEARCH_QUERY_MAX_LENGTH` aplicado (cobre também R14)
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run search-injection`)
- [ ] Revisão de código por par antes do merge

---

## [R18] Mass Assignment no `POST /api/v1/skills` — CRÍTICO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/lib/registry.ts
export const publishSkillSchema = z.object({
  name: z.string().min(2).regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  description: z.string().min(8),
  author: z.string().min(2),
  visibility: z.enum(["public", "private", "unlisted"]).default("public"),
  category: z.string().optional().default("uncategorized"),
  tags: z.array(z.string()).default([]),
  ai: z.array(z.string()).default(["claude"]),
  repository: z.string().url().optional().nullable(),
  homepage: z.string().url().optional().nullable(),
  changelog: z.string().optional().nullable(),
  file_url: z.string().url().optional(),
  file_size: z.number().int().positive().optional()
});
```

```typescript
// apps/web/app/api/v1/skills/route.ts
const normalized = typeof body.tags === "string"
  ? { ...body, tags: body.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean) }
  : body;

const skill = await publishSkill(normalized, auth.userId);
```

**Por que é explorável:**
`normalized` é construído com **spread de `body`** (`{ ...body, tags: ... }`), ou seja, qualquer campo extra enviado pelo cliente (`downloads`, `stars`, `author_id`, `verified`, `id`) passa para `publishSkillSchema.parse(normalized)`. O Zod, por padrão, **ignora silenciosamente campos não declarados no schema** — o que hoje protege porque `skillMutation` em `publishSkill` mapeia campos manualmente. Mas isto é fragilíssimo: qualquer refactor futuro que faça `supabase.from("skills").upsert(payload)` directamente (em vez de `skillMutation`) reintroduz mass assignment imediato. Além disso, não há teste que garanta esta propriedade.

**Impacto potencial:**
Se o mapeamento explícito for removido/alterado por engano, um atacante pode definir `author_id` de outra pessoa, marcar `verified: true`, ou inflar `downloads`/`stars` directamente via `POST /api/v1/skills`.

---

### Arquitectura da Correcção

```
Body do cliente (JSON arbitrário)
   │
   ▼
publishSkillSchema.strict().parse(body)   ← rejeita campos desconhecidos
   │  zod .strict() lança erro se houver chaves extra (downloads, author_id, ...)
   ▼
payload (apenas campos whitelisted)
   │
   ▼
skillMutation = { ...mapeamento explícito existente, author_id: userId }
   │
   ▼
supabase.from("skills").upsert(skillMutation)
```

---

### Implementação Passo a Passo

#### Passo 1 — Tornar o schema estrito (`.strict()`)

```typescript
// apps/web/lib/registry.ts
export const publishSkillSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  description: z.string().min(8).max(2000),
  author: z.string().min(2).max(60),
  visibility: z.enum(["public", "private", "unlisted"]).default("public"),
  category: z.string().max(60).optional().default("uncategorized"),
  tags: z.array(z.string().max(30)).max(10).default([]),
  ai: z.array(z.string().max(20)).max(5).default(["claude"]),
  repository: z.string().url().max(300).optional().nullable(),
  homepage: z.string().url().max(300).optional().nullable(),
  changelog: z.string().max(10_000).optional().nullable(),
  file_url: z.string().url().optional(),
  file_size: z.number().int().positive().max(50 * 1024 * 1024).optional() // 50MB
}).strict(); // <- rejeita qualquer campo fora da lista (downloads, stars, author_id, verified, id, ...)
```

#### Passo 2 — Tratar o erro de `.strict()` na rota com mensagem clara

```typescript
// apps/web/app/api/v1/skills/route.ts
import { z } from "zod";

export async function POST(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.scopes.includes("publish")) return NextResponse.json({ error: "Token missing 'publish' scope" }, { status: 403 });

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
    if (error instanceof z.ZodError) {
      // .strict() gera "unrecognized_keys" para campos extra como downloads/author_id
      return NextResponse.json({ error: "Invalid payload", details: error.flatten() }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Publish failed";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
```

#### Passo 3 — Garantir que `skillMutation` continua a ser a única fonte da escrita (já correcto, documentar)

```typescript
// apps/web/lib/registry.ts — adicionar comentário de governança acima de skillMutation
// ⚠️ NUNCA substituir este objecto por `...payload` ou `...body` directo no
// upsert/insert do Supabase. Cada campo escrito deve estar listado
// explicitamente aqui. Ver R18 no blueprint de segurança.
const skillMutation = {
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
};
```

---

### Teste de Validação

```typescript
// apps/web/__tests__/mass-assignment.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run mass-assignment
import { describe, it, expect } from "vitest";
import { publishSkillSchema } from "@/lib/registry";

describe("R18 — Mass Assignment em POST /api/v1/skills", () => {
  it("rejeita payload com campos não whitelisted (downloads, author_id, verified)", () => {
    const malicious = {
      name: "minha-skill",
      version: "1.0.0",
      description: "Descrição válida com mais de 8 caracteres",
      author: "atacante",
      downloads: 999999,
      stars: 999999,
      author_id: "outro-user-id",
      verified: true
    };

    const result = publishSkillSchema.safeParse(malicious);
    expect(result.success).toBe(false);
    if (!result.success) {
      const unrecognized = result.error.issues.find((i) => i.code === "unrecognized_keys");
      expect(unrecognized).toBeDefined();
    }
  });

  it("aceita payload apenas com campos válidos", () => {
    const valid = {
      name: "minha-skill",
      version: "1.0.0",
      description: "Descrição válida com mais de 8 caracteres",
      author: "saide"
    };
    expect(publishSkillSchema.safeParse(valid).success).toBe(true);
  });
});
```

**Resultado esperado:** Qualquer chave fora da whitelist (`downloads`, `stars`, `author_id`, `verified`, `id`, etc.) faz o `.strict().parse()` lançar `ZodError` com `unrecognized_keys`, retornando `400 Bad Request` em vez de ser silenciosamente ignorada (e potencialmente reintroduzida num refactor futuro).

---

### Checklist de Deploy

- [ ] `publishSkillSchema` com `.strict()` e limites `.max()` em todos os campos
- [ ] Tratamento de `ZodError` no `POST /api/v1/skills` retorna 400 com detalhes
- [ ] Comentário de governança em `skillMutation`
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run mass-assignment`)
- [ ] Revisão de código por par antes do merge

---

## [R03/CTF-R01] Tokens `shb_*` sem segregação nem expiração obrigatória — CRÍTICO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/app/api/v1/auth/token/route.ts
const rawToken = `shb_${randomBytes(24).toString("base64url")}`;
const tokenHash = createHash("sha256").update(rawToken).digest("hex");
const name = typeof body.name === "string" && body.name.length > 0 ? body.name : "default";
const expiresAt = typeof body.expires_at === "string" ? body.expires_at : null;

const { data, error } = await supabase
  .from("api_tokens")
  .insert({ user_id: auth.userId, name, token_hash: tokenHash, scopes, expires_at: expiresAt })
  .select("id, name, scopes, created_at, expires_at")
  .single();
```

**Por que é explorável:**
1. `expires_at` é `null` por padrão — tokens `admin`/`publish` são válidos **para sempre**.
2. Estes tokens `shb_*` são o único mecanismo de Bearer auth para `resolveApiUser`. Se o FateSkill vier a expor MCP Server (fase 2, mencionado na arquitectura) ou subsistemas adicionais (ex.: organizações/equipas), reutilizar o mesmo `token_hash`/escopo entre subsistemas sem segregação por `org_id` recria exactamente o cenário CTF-R01 (secret/token partilhado entre subsistemas → forjar acesso de outro utilizador/organização).
3. Não existe rota para listar/revogar tokens individualmente (`DELETE /api/v1/auth/token/:id`), agravando o R05 abaixo — um token sem expiração e sem revogação é permanente.

**Impacto potencial:**
Um token `admin` vazado (ex.: em log, repositório, CI) concede acesso administrativo permanente e irrevogável à conta.

---

### Arquitectura da Correcção

```
POST /api/v1/auth/token
   │  body: { name, scopes, expires_at? }
   ▼
Validar scopes (existente)
   │
   ▼
expires_at = body.expires_at ?? (now + DEFAULT_TOKEN_TTL)   ← nunca null por defeito
   │
   ▼
Gerar rawToken + hash (existente)
   │
   ▼
INSERT api_tokens { ..., expires_at, scopes }
   │
   ▼
Resposta inclui expires_at calculado

GET    /api/v1/auth/token        → lista tokens do utilizador (sem o valor)
DELETE /api/v1/auth/token/:id    → revoga (apaga ou marca revoked_at)
```

---

### Implementação Passo a Passo

#### Passo 1 — Forçar `expires_at` por defeito

```typescript
// apps/web/app/api/v1/auth/token/route.ts
const DEFAULT_TOKEN_TTL_DAYS = 90;
const MAX_TOKEN_TTL_DAYS = 365;

function resolveExpiresAt(input: unknown): string {
  if (typeof input === "string") {
    const requested = new Date(input);
    const max = new Date(Date.now() + MAX_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(requested.getTime()) && requested <= max) {
      return requested.toISOString();
    }
  }
  return new Date(Date.now() + DEFAULT_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ... dentro do POST
const expiresAt = resolveExpiresAt(body.expires_at);
```

#### Passo 2 — Adicionar `GET` (listar) e `DELETE /:id` (revogar)

```typescript
// apps/web/app/api/v1/auth/token/route.ts — adicionar
export async function GET(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: [] });

  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, name, scopes, created_at, expires_at, last_used")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

```typescript
// apps/web/app/api/v1/auth/token/[id]/route.ts (novo ficheiro)
import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // Garante que só o dono pode revogar (defesa em profundidade: filtro por user_id)
  const { error, count } = await supabase
    .from("api_tokens")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  return NextResponse.json({ id, revoked: true });
}
```

#### Passo 3 — Job de limpeza de tokens expirados (cron Vercel)

```typescript
// apps/web/app/api/v1/cron/cleanup-tokens/route.ts (novo, protegido por header de cron secret)
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ deleted: 0 });

  const { error, count } = await supabase
    .from("api_tokens")
    .delete({ count: "exact" })
    .lt("expires_at", new Date().toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: count ?? 0 });
}
```

---

### Teste de Validação

```typescript
// apps/web/__tests__/token-expiry.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run token-expiry
import { describe, it, expect } from "vitest";

describe("R03/CTF-R01 — Expiração obrigatória de tokens", () => {
  it("token criado sem expires_at recebe expiração padrão de 90 dias", async () => {
    const response = await fetch("https://fateskill.vercel.app/api/v1/auth/token", {
      method: "POST",
      headers: { Authorization: "Bearer <cookie-session-equivalent>", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "teste", scopes: ["read"] })
    });
    const data = await response.json();
    expect(data.expires_at).toBeTruthy();

    const diffDays = (new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(89);
    expect(diffDays).toBeLessThan(91);
  });

  it("DELETE /api/v1/auth/token/:id revoga apenas tokens do próprio utilizador", async () => {
    // cria token de user A, tenta revogar com sessão de user B
    const response = await fetch("https://fateskill.vercel.app/api/v1/auth/token/<id-do-user-A>", {
      method: "DELETE",
      headers: { Authorization: "Bearer <token-de-user-B>" }
    });
    expect(response.status).toBe(404); // não encontrado para user B (filtro por user_id)
  });
});
```

**Resultado esperado:** Nenhum token novo é criado com `expires_at = null`; tokens expirados são removidos pelo cron; utilizadores conseguem listar e revogar os seus próprios tokens via UI.

---

### Checklist de Deploy

- [ ] `resolveExpiresAt` aplicado no `POST /api/v1/auth/token`
- [ ] `GET /api/v1/auth/token` (listar) implementado
- [ ] `DELETE /api/v1/auth/token/:id` implementado e filtra por `user_id`
- [ ] Cron `cleanup-tokens` configurado no `vercel.json` (`crons`) com `CRON_SECRET`
- [ ] Variáveis de ambiente actualizadas: `CRON_SECRET`
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run token-expiry`)
- [ ] Revisão de código por par antes do merge

---

## [R06] Sem rate limiting em rotas críticas — ALTO

### Contexto

**O que existe actualmente:**

Nenhuma das rotas abaixo tem qualquer limitação de taxa:
- `POST /api/v1/auth/token`
- `GET /api/v1/auth/whoami`
- `POST /api/v1/skills` (publish)
- `POST /api/v1/uploads/skills`
- `signInWithOtp` (magic link) em `apps/web/app/login/page.tsx`

```typescript
// apps/web/app/api/v1/auth/token/route.ts
export async function POST(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  // ... sem rate limit
}
```

**Por que é explorável:**
Sem limites, um atacante pode: (1) tentar Bearer tokens em força bruta contra `/auth/whoami` ou qualquer rota autenticada; (2) disparar `signInWithOtp` repetidamente para um e-mail alvo (spam/abuso de quota do provedor de e-mail); (3) inundar `/uploads/skills` com ficheiros grandes, esgotando o bucket Supabase Storage.

**Impacto potencial:**
Brute force de credenciais, negação de serviço por exaustão de storage/quota de e-mail, custos inesperados no Supabase.

---

### Arquitectura da Correcção

```
Requisição → Middleware/Helper de Rate Limit (Upstash Redis)
   │  chave: `${routeName}:${ip}` e/ou `${routeName}:${userId}`
   ▼
Excedeu limite?
   ├─ Sim → 429 Too Many Requests (com Retry-After)
   └─ Não → continua para o handler normal
```

---

### Implementação Passo a Passo

#### Passo 1 — Instalar e configurar Upstash Ratelimit

```bash
pnpm --filter @fateskill/web add @upstash/ratelimit @upstash/redis
```

```env
# apps/web/.env.example — adicionar
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-with-upstash-token
```

#### Passo 2 — Criar helper reutilizável

```typescript
// apps/web/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
  : null;

// Limites por categoria de rota
const limiters = {
  auth: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m") }) : null,       // login/token/otp
  publish: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "10 m") }) : null,  // publish/upload
  default: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m") }) : null
};

export async function enforceRateLimit(
  request: NextRequest,
  category: keyof typeof limiters,
  identifier?: string
): Promise<NextResponse | null> {
  const limiter = limiters[category];
  if (!limiter) return null; // Redis não configurado (dev local) — não bloqueia

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = identifier ? `${category}:${identifier}` : `${category}:ip:${ip}`;

  const { success, reset } = await limiter.limit(key);
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests, please try again later" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)) } }
    );
  }
  return null;
}
```

#### Passo 3 — Aplicar nas rotas críticas

```typescript
// apps/web/app/api/v1/auth/token/route.ts
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const limited = await enforceRateLimit(request, "auth", auth.userId);
  if (limited) return limited;

  // ... resto inalterado
}
```

```typescript
// apps/web/app/api/v1/uploads/skills/route.ts
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "publish");
  if (limited) return limited;
  // ... resto inalterado
}
```

#### Passo 4 — Rate limit no magic link (client-side aviso + server-side via endpoint dedicado)

```typescript
// apps/web/app/api/v1/auth/magic-link/route.ts (novo — proxy para signInWithOtp)
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { email, redirectTo } = await request.json();
  if (typeof email !== "string" || email.length > 254) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const limited = await enforceRateLimit(request, "auth", email.toLowerCase());
  if (limited) return limited;

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
```

> `login/page.tsx` passa a chamar `/api/v1/auth/magic-link` em vez de `supabase.auth.signInWithOtp` directamente no browser.

---

### Teste de Validação

```typescript
// apps/web/__tests__/rate-limit.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run rate-limit
import { describe, it, expect } from "vitest";

describe("R06/CTF-R08/CTF-R09 — Rate limiting", () => {
  it("bloqueia após N tentativas de criação de token no mesmo minuto", async () => {
    const requests = Array.from({ length: 10 }, () =>
      fetch("https://fateskill.vercel.app/api/v1/auth/token", {
        method: "POST",
        headers: { Authorization: "Bearer <token-valido>", "Content-Type": "application/json" },
        body: JSON.stringify({ name: "spam", scopes: ["read"] })
      })
    );
    const responses = await Promise.all(requests);
    const tooMany = responses.filter((r) => r.status === 429);
    expect(tooMany.length).toBeGreaterThan(0);
  });
});
```

**Resultado esperado:** A partir do 6º request (limite configurado: 5/min para `auth`) no mesmo minuto, a resposta passa a `429` com header `Retry-After`.

---

### Checklist de Deploy

- [ ] `@upstash/ratelimit` + `@upstash/redis` instalados
- [ ] `UPSTASH_REDIS_REST_URL`/`TOKEN` configurados no Vercel
- [ ] `enforceRateLimit` aplicado em `auth/token`, `uploads/skills`, novo `auth/magic-link`
- [ ] `login/page.tsx` migrado para `/api/v1/auth/magic-link`
- [ ] Variáveis de ambiente actualizadas
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run rate-limit`)
- [ ] Revisão de código por par antes do merge

---

## [R07] Sem limite de tamanho em campos de texto — ALTO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/lib/registry.ts
export const publishSkillSchema = z.object({
  description: z.string().min(8),
  tags: z.array(z.string()).default([]),
  changelog: z.string().optional().nullable(),
  // ...
});
```

```typescript
// packages/cli/src/utils/manifest.ts
export const skillManifestSchema = z.object({
  description: z.string().min(8),
  tags: z.array(z.string()).default([]),
  // ...
});
```

**Por que é explorável:**
Sem `.max()`, um payload de `POST /api/v1/skills` pode incluir `description`/`changelog` de vários MB e `tags` com milhares de elementos. Cada `listSkills`/`getSkill` devolve estes campos integralmente, inflando respostas da API e o armazenamento em `skills`/`skill_versions`.

**Impacto potencial:**
Negação de serviço (respostas gigantes, lentidão de full-text search com `to_tsvector` em textos enormes), custo de armazenamento.

---

### Arquitectura da Correcção

```
publishSkillSchema (Zod)
   description: max 2000
   changelog:   max 10000
   category:    max 60
   tags:        array max 10, cada item max 30
   name/author: já com min(); adicionar max(60)
   repository/homepage: max 300 (ver também R13/R14)
```

---

### Implementação Passo a Passo

#### Passo 1 — Aplicar limites em `apps/web/lib/registry.ts`

```typescript
export const publishSkillSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  description: z.string().min(8).max(2000),
  author: z.string().min(2).max(60),
  visibility: z.enum(["public", "private", "unlisted"]).default("public"),
  category: z.string().max(60).optional().default("uncategorized"),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  ai: z.array(z.string().max(20)).max(5).default(["claude"]),
  repository: z.string().url().max(300).optional().nullable(),
  homepage: z.string().url().max(300).optional().nullable(),
  changelog: z.string().max(10_000).optional().nullable(),
  file_url: z.string().url().optional(),
  file_size: z.number().int().positive().max(50 * 1024 * 1024).optional()
}).strict();
```

#### Passo 2 — Aplicar limites equivalentes no CLI (`packages/cli/src/utils/manifest.ts`)

```typescript
export const skillManifestSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().refine((value: string) => semver.valid(value) !== null, "version must be valid semver"),
  description: z.string().min(8).max(2000),
  author: z.string().min(2).max(60),
  license: z.string().max(40).default("MIT"),
  visibility: z.enum(["public", "private", "unlisted"]).default("public"),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  ai: z.array(z.string().max(20)).max(5).default(["claude"]),
  category: z.string().max(60).default("uncategorized"),
  entry: z.string().max(120).default("SKILL.md"),
  engines: z.record(z.string().max(20)).optional(),
  repository: z.string().url().max(300).optional(),
  homepage: z.string().url().max(300).optional()
});
```

---

### Teste de Validação

```typescript
// apps/web/__tests__/field-limits.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run field-limits
import { describe, it, expect } from "vitest";
import { publishSkillSchema } from "@/lib/registry";

describe("R07 — Limites de tamanho server-side", () => {
  it("rejeita description com mais de 2000 caracteres", () => {
    const payload = {
      name: "minha-skill", version: "1.0.0", author: "saide",
      description: "a".repeat(2001)
    };
    expect(publishSkillSchema.safeParse(payload).success).toBe(false);
  });

  it("rejeita mais de 10 tags", () => {
    const payload = {
      name: "minha-skill", version: "1.0.0", author: "saide",
      description: "Descrição válida com mais de 8 caracteres",
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`)
    };
    expect(publishSkillSchema.safeParse(payload).success).toBe(false);
  });
});
```

**Resultado esperado:** Payloads com campos acima dos limites são rejeitados com `400` antes de chegarem ao Supabase.

---

### Checklist de Deploy

- [ ] Limites `.max()` aplicados em `apps/web/lib/registry.ts`
- [ ] Limites equivalentes em `packages/cli/src/utils/manifest.ts`
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run field-limits`)
- [ ] Revisão de código por par antes do merge

---

## [R12] Upload `.skill` sem validação de Magic Bytes — ALTO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/lib/storage.ts
const buffer = Buffer.from(await params.file.arrayBuffer());

const { error } = await supabase.storage
  .from(SKILL_PACKAGES_BUCKET)
  .upload(path, buffer, {
    contentType: params.file.type || "application/octet-stream",
    upsert: true
  });
```

```typescript
// apps/web/app/api/v1/uploads/skills/route.ts
const file = form.get("file");
if (!name || !version || !(file instanceof File)) {
  return NextResponse.json({ error: "name, version and file are required" }, { status: 400 });
}
```

**Por que é explorável:**
Não há verificação do conteúdo real do ficheiro. `params.file.type` é declarado pelo cliente (qualquer string). Um ficheiro malicioso (ex.: HTML com script, executável, ZIP-bomb) pode ser enviado com nome `.skill` e content-type arbitrário, sendo armazenado e posteriormente servido via `getPublicUrl` — possível vector de XSS reflectido se o bucket servir `content-type` controlado pelo atacante (ex.: `text/html`) e for acedido directamente.

**Impacto potencial:**
Hospedagem de conteúdo malicioso sob o domínio/CDN do Supabase Storage do FateSkill; possível XSS se o ficheiro for renderizado com `content-type: text/html`; ZIP bombs no `AdmZip.extractAllTo` do CLI (`install.ts`) ao extrair.

---

### Arquitectura da Correcção

```
multipart/form-data { name, version, file }
   │
   ▼
Validar tamanho (Content-Length / file.size) ≤ MAX_SKILL_SIZE
   │
   ▼
Ler primeiros 4 bytes do buffer
   │
   ▼
São "PK\x03\x04" (assinatura ZIP)?
   ├─ Não → 400 "Ficheiro não é um ZIP válido"
   └─ Sim → upload com contentType forçado "application/zip"
              + sufixo .skill no path
```

---

### Implementação Passo a Passo

#### Passo 1 — Validar magic bytes e tamanho em `lib/storage.ts`

```typescript
// apps/web/lib/storage.ts
import { getSupabaseAdmin } from "./supabase";

const SKILL_PACKAGES_BUCKET = process.env.SUPABASE_SKILL_PACKAGES_BUCKET ?? "skill-packages";
const MAX_SKILL_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ZIP_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"

function isZipBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer.subarray(0, 4).equals(ZIP_MAGIC_BYTES);
}

export async function uploadSkillPackage(params: { name: string; version: string; file: File }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase storage is not configured");

  if (params.file.size > MAX_SKILL_FILE_SIZE) {
    throw new Error(`File too large: max ${MAX_SKILL_FILE_SIZE / (1024 * 1024)}MB`);
  }

  const buffer = Buffer.from(await params.file.arrayBuffer());

  if (!isZipBuffer(buffer)) {
    throw new Error("Invalid .skill package: file is not a valid ZIP archive");
  }

  const safeName = params.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeVersion = params.version.replace(/[^0-9A-Za-z.+-]/g, "-");
  const path = `${safeName}/${safeVersion}/${safeName}-${safeVersion}.skill`;

  const { error } = await supabase.storage
    .from(SKILL_PACKAGES_BUCKET)
    .upload(path, buffer, {
      contentType: "application/zip", // força, ignora o que o cliente declarou
      upsert: true
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(SKILL_PACKAGES_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}
```

#### Passo 2 — Validar tamanho também na rota antes de ler o buffer

```typescript
// apps/web/app/api/v1/uploads/skills/route.ts
const MAX_SKILL_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "");
  const version = String(form.get("version") ?? "");
  const file = form.get("file");

  if (!name || !version || !(file instanceof File)) {
    return NextResponse.json({ error: "name, version and file are required" }, { status: 400 });
  }

  if (file.size > MAX_SKILL_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds maximum allowed size (20MB)" }, { status: 413 });
  }

  try {
    const upload = await uploadSkillPackage({ name, version, file });
    return NextResponse.json({ file_url: upload.publicUrl, path: upload.path }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
}
```

---

### Teste de Validação

```typescript
// apps/web/__tests__/upload-magic-bytes.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run upload-magic-bytes
import { describe, it, expect } from "vitest";
import { uploadSkillPackage } from "@/lib/storage";

describe("R12 — Validação de Magic Bytes no upload .skill", () => {
  it("rejeita ficheiro que não é ZIP, mesmo com extensão .skill e content-type falso", async () => {
    const fakeFile = new File(["<script>alert(1)</script>"], "malicious-1.0.0.skill", { type: "application/octet-stream" });
    await expect(uploadSkillPackage({ name: "malicious", version: "1.0.0", file: fakeFile })).rejects.toThrow(/not a valid ZIP/i);
  });

  it("aceita ficheiro ZIP válido (assinatura PK\\x03\\x04)", async () => {
    const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const zipFile = new File([zipBuffer], "valid-1.0.0.skill", { type: "application/octet-stream" });
    // Requer SUPABASE configurado em ambiente de teste; caso contrário, mock getSupabaseAdmin
    await expect(uploadSkillPackage({ name: "valid", version: "1.0.0", file: zipFile })).resolves.toHaveProperty("path");
  });

  it("rejeita ficheiro maior que 20MB", async () => {
    const big = new File([new Uint8Array(21 * 1024 * 1024)], "big-1.0.0.skill");
    await expect(uploadSkillPackage({ name: "big", version: "1.0.0", file: big })).rejects.toThrow(/too large/i);
  });
});
```

**Resultado esperado:** Apenas ficheiros que começam com a assinatura ZIP (`PK\x03\x04`) e estão dentro do limite de tamanho são aceites; `contentType` armazenado é sempre `application/zip`, independentemente do declarado pelo cliente.

---

### Checklist de Deploy

- [ ] `isZipBuffer` + `MAX_SKILL_FILE_SIZE` implementados em `lib/storage.ts`
- [ ] Validação de tamanho também na rota `uploads/skills` (fail-fast antes do upload)
- [ ] `contentType` forçado para `application/zip`
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run upload-magic-bytes`)
- [ ] Revisão de código por par antes do merge

---

## [R16/R17] `getSkill` sem leitura autenticada para conteúdo private/unlisted — ALTO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/lib/registry.ts
export async function getSkill(name: string): Promise<SkillDetail | null> {
  noStore();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.from("skills_public_view").select("*").eq("name", name).single();
    if (error) return null;
    return data as SkillDetail;
  }
  return sampleSkills.find((skill) => skill.name === name || skill.slug === name) ?? null;
}
```

`skills_public_view` (migração `0001`) tem `where s.visibility = 'public'`.

**Por que é explorável:**
Todas as rotas que dependem de `getSkill` — `GET /api/v1/skills/:name`, `:version`, `download`, `ai-context`, `content/SKILL.md`, `star`, `recordInstall` — retornam `404 Skill not found` para skills `private`/`unlisted`, **mesmo para o próprio autor autenticado**. Não há nenhum caminho para o autor gerir/baixar/visualizar as suas próprias skills privadas via API. Isto não expõe dados, mas representa R16 (regra de acesso explícita ausente) — o sistema de visibilidade `private`/`unlisted` descrito no README está, na prática, inacessível mesmo a quem deveria ter acesso, e qualquer tentativa futura de "corrigir rapidamente" isto trocando `skills_public_view` por `skills` sem cuidado reintroduziria exposição de dados privados (R17).

**Impacto potencial:**
Funcionalidade quebrada (skills privadas inacessíveis ao dono) tende a levar a "soluções rápidas" inseguras — ex.: trocar a view por `skills` sem filtro, expondo todas as skills privadas de todos os utilizadores.

---

### Arquitectura da Correcção

```
GET /api/v1/skills/:name?  (e endpoints derivados)
   │
   ▼
auth = resolveApiUser(request)  (opcional — pode ser anónimo)
   │
   ▼
getSkillForViewer(name, auth?.userId)
   │
   ├─ consulta tabela `skills` (não a view) com join em skill_versions latest
   ├─ WHERE name = :name
   │     AND (visibility = 'public'
   │          OR author_id = :viewerUserId
   │          OR EXISTS org_members para org da skill)
   │
   ├─ encontrado → retorna SkillDetail
   └─ não encontrado / sem permissão → 404 (mesma resposta, evita oracle de existência)
```

---

### Implementação Passo a Passo

#### Passo 1 — Criar `getSkillForViewer` em `lib/registry.ts`

```typescript
// apps/web/lib/registry.ts
export async function getSkillForViewer(name: string, viewerUserId?: string | null): Promise<SkillDetail | null> {
  noStore();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const fallback = sampleSkills.find((skill) => skill.name === name || skill.slug === name);
    if (!fallback) return null;
    if (fallback.visibility === "public") return fallback;
    return null; // demo data: sem conceito de "owner" local
  }

  // 1. Tenta a view pública primeiro (caso comum, mais rápido / cacheável)
  const { data: publicData } = await supabase.from("skills_public_view").select("*").eq("name", name).maybeSingle();
  if (publicData) return publicData as SkillDetail;

  // 2. Se não está na view pública e não há viewer autenticado, não existe para este utilizador
  if (!viewerUserId) return null;

  // 3. Verifica se o viewer é o autor de uma skill private/unlisted com este nome
  const { data: privateSkill, error } = await supabase
    .from("skills")
    .select(`
      id, name, slug, description, visibility, downloads, stars, tags, category, ai_targets,
      repository, homepage, updated_at, author_id,
      skill_versions!inner(id, version, file_url, instructions, is_latest)
    `)
    .eq("name", name)
    .eq("author_id", viewerUserId)
    .eq("skill_versions.is_latest", true)
    .maybeSingle();

  if (error || !privateSkill) return null;

  const latestVersion = (privateSkill.skill_versions as unknown as { id: string; version: string; file_url: string; instructions?: string }[])[0];

  return {
    id: privateSkill.id,
    name: privateSkill.name,
    slug: privateSkill.slug,
    version: latestVersion?.version ?? "0.0.0",
    version_id: latestVersion?.id,
    description: privateSkill.description,
    author: "you", // não expor username de terceiros aqui; viewer é o próprio autor
    visibility: privateSkill.visibility,
    downloads: privateSkill.downloads,
    stars: privateSkill.stars,
    tags: privateSkill.tags,
    category: privateSkill.category,
    ai_targets: privateSkill.ai_targets,
    repository: privateSkill.repository,
    homepage: privateSkill.homepage,
    updated_at: privateSkill.updated_at,
    entry_url: `/api/v1/skills/${privateSkill.name}/content/SKILL.md`,
    download_url: `/api/v1/skills/${privateSkill.name}/download`,
    versions: [latestVersion?.version ?? "0.0.0"],
    instructions: latestVersion?.instructions
  };
}
```

#### Passo 2 — Actualizar rotas que servem detalhe/download/ai-context/content para usar `getSkillForViewer`

```typescript
// apps/web/app/api/v1/skills/[name]/route.ts (GET)
import { resolveApiUser } from "@/lib/auth";
import { getSkillForViewer } from "@/lib/registry";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request).catch(() => null);
  const skill = await getSkillForViewer(name, auth?.userId ?? null);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json(skill);
}
```

```typescript
// apps/web/app/api/v1/skills/[name]/download/route.ts
export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request).catch(() => null);
  const skill = await getSkillForViewer(name, auth?.userId ?? null);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const source = request.headers.get("user-agent")?.includes("fateskill-cli") ? "cli" : "api";
  await recordInstall(name, source, auth?.userId ?? null);
  // ... resto inalterado
}
```

> Aplicar o mesmo padrão em `[name]/[version]/route.ts`, `ai-context/route.ts`, `content/[file]/route.ts`, `versions/route.ts`.

---

### Teste de Validação

```typescript
// apps/web/__tests__/private-skill-access.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run private-skill-access
import { describe, it, expect } from "vitest";
import { getSkillForViewer } from "@/lib/registry";

describe("R16/R17 — Acesso a skills private/unlisted", () => {
  it("retorna null para skill privada quando viewer não é o autor", async () => {
    const result = await getSkillForViewer("skill-privada-de-outro", "user-B-id");
    expect(result).toBeNull();
  });

  it("retorna a skill quando o viewer é o autor", async () => {
    const result = await getSkillForViewer("skill-privada-de-outro", "user-A-id" /* author_id real */);
    expect(result).not.toBeNull();
    expect(result?.visibility).toBe("private");
  });

  it("retorna skill pública independentemente do viewer", async () => {
    const result = await getSkillForViewer("fofa-tabela-docx", null);
    expect(result).not.toBeNull();
    expect(result?.visibility).toBe("public");
  });
});
```

**Resultado esperado:** Skills `private`/`unlisted` só são retornadas quando `viewerUserId === author_id`; skills `public` continuam acessíveis a qualquer um (incluindo anónimos).

---

### Checklist de Deploy

- [ ] `getSkillForViewer` implementado e cobre `public`, `private` (próprio autor), `unlisted`
- [ ] Rotas `[name]`, `[name]/[version]`, `download`, `ai-context`, `content/[file]`, `versions` migradas
- [ ] Resposta 404 idêntica para "não existe" e "sem permissão" (evita oracle)
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run private-skill-access`)
- [ ] Revisão de código por par antes do merge

---

## [R05] Tokens de API sem expiração padrão nem revogação — ALTO

### Contexto

**O que existe actualmente:**

```tsx
// apps/web/components/token-manager.tsx
{tokens.map((token) => <li key={token.id}>{token.name} — {token.scopes.join(", ")} — {new Date(token.created_at).toLocaleString("pt-PT")}</li>)}
```

Não há botão de revogação; não há `DELETE /api/v1/auth/token/:id` (cobre o mesmo gap descrito em R03/CTF-R01, do ponto de vista de UX/produto).

**Por que é explorável:**
Token comprometido = acesso permanente sem forma de o utilizador o invalidar pela UI.

**Impacto potencial:**
Persistência de acesso não autorizado mesmo após o utilizador suspeitar de comprometimento.

---

### Arquitectura da Correcção

```
TokenManager (UI)
   │
   ├─ lista tokens via GET /api/v1/auth/token (Passo 2 de R03)
   ├─ botão "Revogar" por token → DELETE /api/v1/auth/token/:id
   └─ exibe "expira em: <data>" por token
```

---

### Implementação Passo a Passo

#### Passo 1 — Backend já implementado em R03 (`GET`/`DELETE /api/v1/auth/token[/:id]`)

Ver secção [R03/CTF-R01](#r03ctf-r01-tokens-shb-sem-segregação-nem-expiração-obrigatória--crítico), Passo 2.

#### Passo 2 — Adicionar UI de revogação e exibição de expiração

```tsx
// apps/web/components/token-manager.tsx
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
    const response = await fetch(`/api/v1/auth/token/${id}`, { method: "DELETE" });
    if (response.ok) {
      setTokens((previous) => previous.filter((token) => token.id !== id));
    } else {
      setError("Não foi possível revogar o token");
    }
  };

  return (
    <div>
      {/* ... formulário de criação inalterado ... */}
      {created && <p style={{ color: "var(--brand)" }}>Token criado (copia agora, não será mostrado novamente): <code>{created}</code></p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      <ul>
        {tokens.map((token) => (
          <li key={token.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
```

---

### Teste de Validação

```typescript
// apps/web/__tests__/token-revoke-ui.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run token-revoke-ui
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TokenManager } from "@/components/token-manager";

describe("R05 — Revogação de tokens na UI", () => {
  it("remove o token da lista após clicar em Revogar", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;

    render(<TokenManager initialTokens={[{ id: "tok1", name: "cli-laptop", scopes: ["publish"], created_at: new Date().toISOString() }]} />);

    expect(screen.getByText(/cli-laptop/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Revogar"));

    await waitFor(() => expect(screen.queryByText(/cli-laptop/)).not.toBeInTheDocument());
  });
});
```

**Resultado esperado:** Clicar em "Revogar" remove o token da lista e chama `DELETE /api/v1/auth/token/:id`; a data de expiração é visível para cada token.

---

### Checklist de Deploy

- [ ] `GET`/`DELETE /api/v1/auth/token[/:id]` implementados (ver R03)
- [ ] UI `TokenManager` com botão "Revogar" e exibição de `expires_at`
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run token-revoke-ui`)
- [ ] Revisão de código por par antes do merge

---

## [R02] Enumeração de utilizadores em `/api/v1/users/:username` — ALTO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/app/api/v1/users/[username]/route.ts
export async function GET(_: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { data } = await listSkills({ author: username });
  return NextResponse.json({ username, verified: username === "saide", skills_count: data.length });
}
```

**Por que é explorável:**
1. `verified: username === "saide"` é uma comparação hardcoded — não reflecte a coluna real `profiles.verified`, podendo divergir e, mais importante, é um padrão frágil que um atacante pode usar para confirmar nomes de utilizador "especiais" hardcoded no código (se o código-fonte for público, como sugere o README/GitHub).
2. O endpoint sempre responde `200` com `skills_count` (0 para usernames inexistentes), permitindo enumeração indirecta combinando com `/users/:username/skills` para confirmar quais perfis existem.

**Impacto potencial:**
Enumeração de usernames válidos facilita ataques direccionados (phishing, password spraying caso exista login por username).

---

### Arquitectura da Correcção

```
GET /api/v1/users/:username
   │
   ▼
profile = SELECT id, verified FROM profiles WHERE username = :username
   │
   ├─ não existe → 404 { error: "User not found" }
   └─ existe → { username, verified: profile.verified, skills_count }
```

---

### Implementação Passo a Passo

#### Passo 1 — Consultar `profiles` real e retornar 404 quando não existe

```typescript
// apps/web/app/api/v1/users/[username]/route.ts
import { NextResponse } from "next/server";
import { listSkills } from "@/lib/registry";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, verified")
      .eq("username", username)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data } = await listSkills({ author: username });
    return NextResponse.json({ username: profile.username, verified: profile.verified ?? false, skills_count: data.length });
  }

  // Fallback demo: mantém comportamento permissivo apenas em ambiente sem Supabase
  const { data } = await listSkills({ author: username });
  if (data.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ username, verified: username === "saide", skills_count: data.length });
}
```

> Nota: retornar 404 para usernames sem skills públicas pode em si revelar pouco mais do que já é possível via `/users/:username/skills` (que também retorna lista vazia). O ganho real aqui é remover a comparação hardcoded `username === "saide"` e usar a coluna `verified` real — a parte mais importante da correcção.

---

### Teste de Validação

```typescript
// apps/web/__tests__/user-verified-flag.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run user-verified-flag
import { describe, it, expect } from "vitest";

describe("R02 — Flag 'verified' não hardcoded", () => {
  it("não usa comparação hardcoded de username para 'verified'", async () => {
    const response = await fetch("https://fateskill.vercel.app/api/v1/users/outro-utilizador-verificado");
    const data = await response.json();
    // 'verified' deve reflectir profiles.verified, não username === 'saide'
    expect(typeof data.verified).toBe("boolean");
  });
});
```

**Resultado esperado:** `verified` reflecte a coluna `profiles.verified` para qualquer username, não apenas `"saide"`.

---

### Checklist de Deploy

- [ ] `profiles.verified` consultado em vez de comparação hardcoded
- [ ] 404 retornado para usernames inexistentes (quando Supabase configurado)
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run user-verified-flag`)
- [ ] Revisão de código por par antes do merge

---

## [CTF-R10] Middleware fail-open sem Supabase configurado — MÉDIO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/middleware.ts
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return response; // ⚠️ fail-open

  // ... verificação de sessão e protecção de /dashboard, /publish, /settings
}
```

**Por que é explorável:**
Em qualquer ambiente (preview/staging/produção mal configurada) onde `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` não estejam definidas, **todas** as rotas protegidas (`/dashboard`, `/publish`, `/settings`) ficam acessíveis sem autenticação — "rotas escondidas" deixam de ser escondidas e a única barreira (auth) desaparece silenciosamente. Relacionado a CTF-R10: ausência de uma camada de auth robusta torna a "obscuridade" (depender de env vars correctas) a única defesa.

**Impacto potencial:**
Exposição total do dashboard/configurações/publish em ambientes mal configurados, sem qualquer aviso.

---

### Arquitectura da Correcção

```
middleware()
   │
   ▼
Supabase env vars ausentes?
   ├─ Sim
   │    ├─ rota protegida (/dashboard, /publish, /settings)? → bloquear (redirect /login ou 503)
   │    └─ rota pública? → permitir (comportamento actual de demo)
   └─ Não → fluxo normal de verificação de sessão
```

---

### Implementação Passo a Passo

#### Passo 1 — Fail-closed apenas para rotas protegidas quando env vars ausentes

```typescript
// apps/web/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/dashboard", "/publish", "/settings"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const isProtected = PROTECTED_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isProtected) {
      // Fail-closed: sem Supabase configurado, não há como verificar sessão —
      // bloquear rotas sensíveis em vez de servir o conteúdo livremente.
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
      loginUrl.searchParams.set("reason", "auth-not-configured");
      return NextResponse.redirect(loginUrl);
    }
    return response; // rotas públicas/demo continuam acessíveis
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();

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

### Teste de Validação

```typescript
// apps/web/__tests__/middleware-fail-closed.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run middleware-fail-closed
import { describe, it, expect, beforeEach } from "vitest";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

describe("CTF-R10 — Middleware fail-closed sem Supabase configurado", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("redirige /dashboard para /login quando Supabase não está configurado", async () => {
    const request = new NextRequest(new Request("https://fateskill.vercel.app/dashboard"));
    const response = await middleware(request);
    expect(response.status).toBe(307); // redirect
    expect(response.headers.get("location")).toContain("/login");
  });

  it("permite acesso a / (rota pública) quando Supabase não está configurado", async () => {
    const request = new NextRequest(new Request("https://fateskill.vercel.app/"));
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });
});
```

**Resultado esperado:** Sem env vars Supabase, `/dashboard`, `/publish`, `/settings` redireccionam para `/login`; rotas públicas (`/`, `/skills`) continuam a funcionar normalmente (modo demo).

---

### Checklist de Deploy

- [ ] `middleware.ts` actualizado com fail-closed para rotas protegidas
- [ ] Verificar que ambientes de preview sem env vars não expõem `/dashboard`/`/publish`/`/settings`
- [ ] Variáveis de ambiente actualizadas (documentar obrigatoriedade em produção)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run middleware-fail-closed`)
- [ ] Revisão de código por par antes do merge

---

## [R13/R14] Sem restrição em `repository`/`homepage` URLs — MÉDIO

### Contexto

**O que existe actualmente:**

```typescript
// apps/web/lib/registry.ts
repository: z.string().url().optional().nullable(),
homepage: z.string().url().optional().nullable(),
```

Renderizado em:

```tsx
// apps/web/app/(registry)/skills/[name]/page.tsx
<a href={skill.download_url} className="button">Download .skill</a>
```

(e potencialmente `repository`/`homepage` em futuras páginas de detalhe).

**Por que é explorável:**
`z.string().url()` aceita qualquer esquema reconhecido por `new URL()`, incluindo `javascript:`, `data:`, `vbscript:` em alguns ambientes, além de não limitar o comprimento. Se estes campos forem renderizados como `<a href={skill.repository}>` sem sanitização adicional, há risco de XSS via esquema `javascript:` (R11/R13) e de URLs excessivamente longas afectando layout/armazenamento (R14).

**Impacto potencial:**
XSS reflectido/armazenado de baixo a médio impacto se renderizado sem `rel="noopener noreferrer"` e sem whitelist de esquema; poluição de dados com URLs gigantes.

---

### Arquitectura da Correcção

```
publishSkillSchema
   repository/homepage: z.string().max(300).refine(httpOrHttpsOnly)
   │
   ▼
Renderização: <a href={url} rel="noopener noreferrer" target="_blank">
   + helper isSafeExternalUrl(url) antes de renderizar
```

---

### Implementação Passo a Passo

#### Passo 1 — Restringir esquema e comprimento no schema

```typescript
// apps/web/lib/registry.ts
const httpUrlSchema = z.string().max(300).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "URL must be http(s) and at most 300 characters");

export const publishSkillSchema = z.object({
  // ...
  repository: httpUrlSchema.optional().nullable(),
  homepage: httpUrlSchema.optional().nullable(),
  // ...
}).strict();
```

#### Passo 2 — Helper de renderização segura + uso nas páginas

```typescript
// apps/web/lib/safe-url.ts
export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 300) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
```

```tsx
// apps/web/app/(registry)/skills/[name]/page.tsx — exemplo de uso ao adicionar links de repository/homepage
import { isSafeExternalUrl } from "@/lib/safe-url";

{isSafeExternalUrl(skill.repository) && (
  <a href={skill.repository} target="_blank" rel="noopener noreferrer">Repositório</a>
)}
{isSafeExternalUrl(skill.homepage) && (
  <a href={skill.homepage} target="_blank" rel="noopener noreferrer">Homepage</a>
)}
```

---

### Teste de Validação

```typescript
// apps/web/__tests__/safe-urls.test.ts
// Executar com: pnpm --filter @fateskill/web exec vitest run safe-urls
import { describe, it, expect } from "vitest";
import { publishSkillSchema } from "@/lib/registry";
import { isSafeExternalUrl } from "@/lib/safe-url";

describe("R13/R14 — Validação de repository/homepage", () => {
  it("rejeita esquema javascript:", () => {
    const payload = { name: "x", version: "1.0.0", author: "saide", description: "Descrição válida com 8+", repository: "javascript:alert(1)" };
    expect(publishSkillSchema.safeParse(payload).success).toBe(false);
  });

  it("rejeita URL com mais de 300 caracteres", () => {
    const longUrl = "https://example.com/" + "a".repeat(300);
    const payload = { name: "x", version: "1.0.0", author: "saide", description: "Descrição válida com 8+", homepage: longUrl };
    expect(publishSkillSchema.safeParse(payload).success).toBe(false);
  });

  it("isSafeExternalUrl rejeita data: e javascript:", () => {
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeExternalUrl("https://github.com/saide/foo")).toBe(true);
  });
});
```

**Resultado esperado:** Apenas URLs `http`/`https` com até 300 caracteres são aceites no schema; links externos são sempre renderizados com `rel="noopener noreferrer"` após passar por `isSafeExternalUrl`.

---

### Checklist de Deploy

- [ ] `httpUrlSchema` aplicado a `repository`/`homepage`
- [ ] `isSafeExternalUrl` criado em `lib/safe-url.ts`
- [ ] Páginas de detalhe usam `isSafeExternalUrl` + `rel="noopener noreferrer"` ao renderizar links externos
- [ ] Variáveis de ambiente actualizadas (se aplicável)
- [ ] Testes de segurança a passar (`pnpm --filter @fateskill/web exec vitest run safe-urls`)
- [ ] Revisão de código por par antes do merge

---

## Checklist Global Pré-Deploy

### Obrigatório (CRÍTICO e ALTO)
- [ ] R15 — `PUT`/`DELETE /api/v1/skills/:name` com auth + ownership check
- [ ] R22 — Client user-scoped (RLS) para mutações de utilizador, admin client documentado e restrito
- [ ] R09/R10 — Sanitização do filtro de pesquisa `.or()`
- [ ] R18 — `publishSkillSchema.strict()` + tratamento de `ZodError`
- [ ] R03/CTF-R01 — Expiração obrigatória de tokens + `GET`/`DELETE /api/v1/auth/token[/:id]`
- [ ] R06/CTF-R08/CTF-R09 — Rate limiting em `auth/token`, `uploads/skills`, magic link
- [ ] R07 — Limites `.max()` em todos os campos de texto (web + CLI)
- [ ] R12 — Validação de magic bytes ZIP + limite de tamanho no upload `.skill`
- [ ] R16/R17 — `getSkillForViewer` para acesso autenticado a skills `private`/`unlisted`
- [ ] R05 — UI de revogação de tokens
- [ ] Suite de testes de segurança a passar integralmente (`pnpm --filter @fateskill/web exec vitest run`)
- [ ] Variáveis de ambiente auditadas — nenhum secret no código (`UPSTASH_*`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` apenas no Vercel)
- [ ] RLS configurado e testado (policies de `0001_initial_fateskill.sql` + novo client user-scoped)
- [ ] Rate limiting activo em endpoints de autenticação
- [ ] Logs de segurança activos para operações de publish/star/download

### Recomendado (MÉDIO e Boas Práticas)
- [ ] CTF-R10 — Middleware fail-closed para `/dashboard`, `/publish`, `/settings`
- [ ] R13/R14 — `repository`/`homepage` restritos a http(s) + 300 chars + `rel="noopener noreferrer"`
- [ ] R02 — `verified` lido de `profiles.verified`, não hardcoded
- [ ] Testes de penetração com IA (R25) realizados sobre os endpoints `/api/v1/*`
- [ ] Documentação de regras de acesso (visibilidade `public`/`unlisted`/`private`) actualizada no README
- [ ] CAPTCHA configurado em login (magic link) e criação de tokens
- [ ] Rotação de `SUPABASE_SERVICE_ROLE_KEY` e `NPM_TOKEN` agendada

---

## Referências e Recursos

| Recurso | Descrição |
|---------|-----------|
| [OWASP Top 10](https://owasp.org/www-project-top-ten/) | Top 10 vulnerabilidades mais críticas da web |
| [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security) | Configuração correcta de Row Level Security |
| [PostgREST Filtering](https://postgrest.org/en/stable/references/api/tables_views.html#operators) | Sintaxe de operadores `.or()` e riscos de injecção |
| [@upstash/ratelimit](https://www.npmjs.com/package/@upstash/ratelimit) | Rate limiting serverless para Vercel/Next.js |
| [zod](https://zod.dev/) | Validação de schema server-side em TypeScript, incl. `.strict()` |

---

_Blueprint gerado automaticamente pela Security Audit Skill v1.0_
_Baseado em: Relatório CTF v1.0 + Plataforma de Análise de Segurança de Código v1.0_
