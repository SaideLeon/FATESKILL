# FateSkill — Arquitectura Completa
> Registo público/privado de Skills para IAs, com CLI e API programática

---

## 1. Visão Geral

**FateSkill** é o "npm para skills de IA" — uma plataforma onde qualquer pessoa pode publicar, partilhar e instalar `.skill` files que extendem o comportamento de modelos como Claude. Funciona em três camadas:

```
┌─────────────────────────────────────────────┐
│              WEB (Next.js)                   │  Browse, publicar, gerir
├─────────────────────────────────────────────┤
│              API REST (Next.js routes)       │  Consumo programático
├─────────────────────────────────────────────┤
│              CLI  (Node.js → npm)            │  `fateskill install fofa`
└─────────────────────────────────────────────┘
         ▼ armazena em ▼
┌─────────────────────────────────────────────┐
│   Supabase (PostgreSQL + Storage + Auth)     │
└─────────────────────────────────────────────┘
```

---

## 2. Formato das Skills

### 2.1 Estrutura no registo

```
fofa-tabela-docx/
├── skill.json         ← manifesto (obrigatório)
├── SKILL.md           ← instruções para a IA (obrigatório)
├── scripts/           ← scripts executáveis (opcional)
├── references/        ← docs de referência (opcional)
└── assets/            ← templates, fontes, ícones (opcional)
```

### 2.2 skill.json (manifesto)

```json
{
  "name": "fofa-tabela-docx",
  "version": "1.2.0",
  "description": "Formata tabelas FOFA/SWOT em documentos Word académicos moçambicanos",
  "author": "saide",
  "license": "MIT",
  "visibility": "public",
  "tags": ["docx", "academic", "mozambique", "fofa", "swot"],
  "ai": ["claude"],
  "category": "document-processing",
  "entry": "SKILL.md",
  "engines": {
    "claude": ">=3.0"
  },
  "repository": "https://github.com/saide/fofa-tabela-docx",
  "homepage": "https://fateskill.vercel.app/skills/fofa-tabela-docx"
}
```

### 2.3 Formato do pacote publicado (`.skill`)

Um `.skill` é simplesmente um ZIP renomeado:
```
fofa-tabela-docx-1.2.0.skill
  └── (conteúdo da pasta acima)
```

---

## 3. Base de Dados (Supabase/PostgreSQL)

### Schema

```sql
-- Utilizadores (gerido pelo Supabase Auth)
-- Adicionamos perfil público
create table profiles (
  id          uuid primary key references auth.users,
  username    text unique not null,
  bio         text,
  avatar_url  text,
  verified    boolean default false,
  created_at  timestamptz default now()
);

-- Skills
create table skills (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,          -- "fofa-tabela-docx"
  slug        text unique not null,          -- igual ao name, indexed
  author_id   uuid references profiles(id),
  description text not null,
  visibility  text default 'public'          -- 'public' | 'private' | 'unlisted'
    check (visibility in ('public','private','unlisted')),
  category    text,
  tags        text[] default '{}',
  ai_targets  text[] default '{claude}',
  downloads   int default 0,
  stars       int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Versões (semver)
create table skill_versions (
  id          uuid primary key default gen_random_uuid(),
  skill_id    uuid references skills(id) on delete cascade,
  version     text not null,                -- "1.2.0"
  changelog   text,
  file_url    text not null,               -- URL no Supabase Storage
  file_size   int,
  is_latest   boolean default false,
  published_at timestamptz default now(),
  unique (skill_id, version)
);

-- Stars
create table skill_stars (
  user_id   uuid references profiles(id),
  skill_id  uuid references skills(id),
  starred_at timestamptz default now(),
  primary key (user_id, skill_id)
);

-- Instalações (analytics)
create table skill_installs (
  id          uuid primary key default gen_random_uuid(),
  skill_id    uuid references skills(id),
  version_id  uuid references skill_versions(id),
  user_id     uuid references profiles(id),  -- null se anónimo
  source      text,                           -- 'cli' | 'api' | 'web'
  installed_at timestamptz default now()
);

-- Tokens de API
create table api_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id),
  name        text not null,
  token_hash  text unique not null,
  scopes      text[] default '{read}',       -- 'read' | 'publish' | 'admin'
  last_used   timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz default now()
);

-- Organizações (para skills privadas de equipa)
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  owner_id    uuid references profiles(id),
  created_at  timestamptz default now()
);

create table org_members (
  org_id    uuid references organizations(id),
  user_id   uuid references profiles(id),
  role      text default 'member',           -- 'owner' | 'admin' | 'member'
  primary key (org_id, user_id)
);

-- RLS
alter table skills enable row level security;
alter table skill_versions enable row level security;

-- Skills públicas: qualquer um lê
create policy "public skills readable" on skills
  for select using (visibility = 'public');

-- Skills privadas: só o autor e org members
create policy "private skills by owner" on skills
  for select using (
    visibility != 'public' and author_id = auth.uid()
  );

-- Só o autor pode escrever
create policy "author manages skill" on skills
  for all using (author_id = auth.uid());
```

---

## 4. API REST

### Base URL: `https://fateskill.vercel.app/api/v1`

### Endpoints

```
GET    /skills                   → listar/pesquisar skills
GET    /skills/:name             → detalhes + última versão
GET    /skills/:name/:version    → versão específica
GET    /skills/:name/download    → redirect para .skill file
POST   /skills                   → publicar nova skill (auth)
PUT    /skills/:name             → actualizar metadados (auth)
DELETE /skills/:name             → remover skill (auth)
POST   /skills/:name/star        → dar star (auth)
GET    /skills/:name/versions    → todas as versões
GET    /users/:username          → perfil público
GET    /users/:username/skills   → skills de um utilizador
POST   /auth/token               → criar API token
```

### Exemplo de resposta `GET /skills/fofa-tabela-docx`

```json
{
  "name": "fofa-tabela-docx",
  "version": "1.2.0",
  "description": "Formata tabelas FOFA/SWOT em Word académico moçambicano",
  "author": "saide",
  "visibility": "public",
  "downloads": 1247,
  "stars": 38,
  "tags": ["docx", "academic", "mozambique"],
  "entry_url": "https://fateskill.vercel.app/api/v1/skills/fofa-tabela-docx/content/SKILL.md",
  "download_url": "https://fateskill.vercel.app/api/v1/skills/fofa-tabela-docx/download",
  "versions": ["1.0.0", "1.1.0", "1.2.0"],
  "updated_at": "2026-05-10T14:32:00Z"
}
```

### Parâmetros de pesquisa `GET /skills`

```
?q=mozambique docx          texto livre
?tag=academic               por tag
?category=document-processing
?author=saide
?sort=downloads|stars|recent
?page=1&limit=20
```

---

## 5. CLI Tool

### Instalação

```bash
npm install -g fateskill-cli
```

### Comandos

```bash
# Autenticação
fateskill login                        # abre browser para OAuth
fateskill logout
fateskill whoami

# Inicializar nova skill
fateskill init                         # cria skill.json interactivo

# Publicar
fateskill publish                      # publica versão actual
fateskill publish --access private     # skill privada

# Instalar (descarrega para /mnt/skills/user/ por padrão)
fateskill install fofa-tabela-docx
fateskill install fofa-tabela-docx@1.1.0    # versão específica
fateskill install saide/fofa-tabela-docx    # por autor

# Listar
fateskill search "docx academic"
fateskill list                         # skills instaladas localmente
fateskill info fofa-tabela-docx

# Actualizar
fateskill update                       # actualiza todas
fateskill update fofa-tabela-docx

# Remover
fateskill uninstall fofa-tabela-docx
fateskill unpublish fofa-tabela-docx   # remove do registo

# Token de API
fateskill token create --name "meu-app" --scope publish
fateskill token list
fateskill token revoke <id>
```

### Configuração (`~/.fateskill/config.json`)

```json
{
  "registry": "https://fateskill.vercel.app/api/v1",
  "install_dir": "/mnt/skills/user",
  "auth_token": "shb_xxxxxxxxxxxx"
}
```

---

## 6. Stack Técnica

### Frontend + Backend (monorepo Next.js 15)

```
fateskill/
├── apps/
│   └── web/                     ← Next.js 15 (App Router)
│       ├── app/
│       │   ├── (marketing)/     ← landing, about
│       │   ├── (registry)/      ← browse, skill pages
│       │   │   ├── skills/
│       │   │   │   ├── page.tsx          ← lista/pesquisa
│       │   │   │   └── [name]/
│       │   │   │       ├── page.tsx      ← detalhe da skill
│       │   │   │       └── [version]/
│       │   │   │           └── page.tsx
│       │   │   └── users/[username]/
│       │   ├── (dashboard)/     ← área autenticada
│       │   │   ├── dashboard/
│       │   │   ├── publish/
│       │   │   └── settings/
│       │   └── api/
│       │       └── v1/
│       │           ├── skills/
│       │           │   └── route.ts
│       │           └── auth/
│       └── lib/
│           ├── supabase.ts
│           └── storage.ts
├── packages/
│   └── cli/                     ← Node.js CLI (publicado no npm)
│       ├── src/
│       │   ├── commands/
│       │   │   ├── install.ts
│       │   │   ├── publish.ts
│       │   │   ├── search.ts
│       │   │   └── login.ts
│       │   ├── api-client.ts
│       │   └── index.ts
│       └── package.json
└── package.json                 ← turborepo / pnpm workspaces
```

### Dependências principais

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router) |
| DB | Supabase PostgreSQL |
| Auth | Supabase Auth (GitHub OAuth + magic link) |
| Storage | Supabase Storage (buckets: `skills-public`, `skills-private`) |
| Search | PostgreSQL `pg_trgm` + `to_tsvector` (full-text) |
| CLI | Commander.js + Axios + ora (spinner) |
| Deploy | Vercel |
| CDN para .skill files | Supabase Storage CDN |

---

## 7. Fluxo de Publicação

```
1. Autor cria skill localmente
   └── SKILL.md + skill.json

2. fateskill publish
   ├── valida skill.json (semver, campos obrigatórios)
   ├── empacota → fofa-tabela-docx-1.2.0.skill (ZIP)
   ├── POST /api/v1/skills com API token
   └── Upload do .skill para Supabase Storage

3. API:
   ├── verifica token + scopes
   ├── insere/actualiza row em `skills`
   ├── cria row em `skill_versions` com file_url
   └── retorna URL pública

4. Skill fica disponível imediatamente
```

---

## 8. Fluxo de Instalação (CLI)

```
fateskill install fofa-tabela-docx

1. GET /api/v1/skills/fofa-tabela-docx          ← resolve última versão
2. GET /api/v1/skills/fofa-tabela-docx/download ← redirige para Storage URL
3. Download do .skill (ZIP)
4. Extrai para /mnt/skills/user/fofa-tabela-docx/
5. Regista em ~/.fateskill/installed.json
```

---

## 9. Integração com IA (o diferencial)

### 9.1 Consumo directo pela IA

Qualquer IA com acesso à web pode consumir skills via URL pública:

```
GET https://fateskill.vercel.app/api/v1/skills/fofa-tabela-docx/content/SKILL.md
```

Retorna o SKILL.md em texto puro, pronto para ser injectado no contexto.

### 9.2 System Prompt Injection Pattern

O utilizador fornece ao Claude uma URL do FateSkill:
```
"Usa a skill https://fateskill.vercel.app/s/fofa-tabela-docx neste documento"
```

Claude faz `web_fetch` → obtém SKILL.md → executa as instruções.

### 9.3 MCP Server (fase 2)

Um **MCP Server** oficial que permite ao Claude:
```json
{
  "tools": [
    {
      "name": "fateskill_search",
      "description": "Pesquisar skills no FateSkill registry"
    },
    {
      "name": "fateskill_install",
      "description": "Instalar skill e carregar instruções no contexto"
    },
    {
      "name": "fateskill_read",
      "description": "Ler conteúdo de uma skill pelo nome"
    }
  ]
}
```

### 9.4 Endpoint AI-friendly

```
GET /api/v1/skills/:name/ai-context

Retorna JSON optimizado para injecção em sistema de prompts:
{
  "name": "fofa-tabela-docx",
  "trigger_description": "...",
  "instructions": "... conteúdo SKILL.md ...",
  "version": "1.2.0"
}
```

---

## 10. Sistema de Visibilidade

| Nível | Comportamento |
|-------|--------------|
| `public` | Listado no registo, acessível sem auth |
| `unlisted` | Não listado, mas acessível por URL directa |
| `private` | Só o autor (e org members) acedem, requer token |

---

## 11. Monetização (opcional, fase 3)

- Skills pagas (one-time ou subscrição) via Stripe
- Plano Pro: skills privadas ilimitadas, analytics detalhados
- Organizações: gestão de skills de equipa, SSO

---

## 12. Fases de Desenvolvimento

### Fase 1 — MVP (4–6 semanas)
- [ ] Schema Supabase + RLS
- [ ] API REST básica (CRUD skills + download)
- [ ] CLI: `login`, `publish`, `install`, `search`
- [ ] Web: landing + browse + skill detail page
- [ ] Auth: GitHub OAuth via Supabase

### Fase 2 — Registry completo (4 semanas)
- [ ] Versioning completo (semver)
- [ ] Sistema de stars
- [ ] Analytics (downloads por versão, por país)
- [ ] Full-text search com `pg_trgm`
- [ ] Dashboard do autor
- [ ] API tokens com scopes

### Fase 3 — AI-native (4 semanas)
- [ ] MCP Server oficial
- [ ] Endpoint `/ai-context`
- [ ] Suporte multi-IA (tags `ai: [claude, gpt, gemini]`)
- [ ] Organizações + skills de equipa
- [ ] CLI: `fateskill update`, `fateskill list`

---

## 13. Exemplo Completo de Uso

```bash
# Autor publica
cd ~/skills/fofa-tabela-docx
fateskill publish
# → fofa-tabela-docx@1.2.0 publicado ✓
# → https://fateskill.vercel.app/skills/fofa-tabela-docx

# Utilizador instala
fateskill install fofa-tabela-docx
# → instalado em /mnt/skills/user/fofa-tabela-docx/ ✓

# IA consome via API (web_fetch)
# Claude faz: GET /api/v1/skills/fofa-tabela-docx/content/SKILL.md
# → executa as instruções directamente
```

---

## 14. Decisões de Arquitectura

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Formato do pacote | ZIP renomeado `.skill` | Simples, sem dependência de tooling especial |
| Versioning | Semver estrito | Padrão da indústria, compatível com npm |
| Storage | Supabase Storage | Já no stack de Saíde, CDN integrado |
| Search | PostgreSQL full-text | Evita dependência de Elasticsearch |
| CLI language | TypeScript/Node.js | Publicável no npm, familiar ao stack |
| Auth | Supabase Auth + GitHub OAuth | Zero-config, JWT nativo |
| API format | REST JSON | Máxima compatibilidade com qualquer cliente |

---

*Próximo passo sugerido: implementar o Schema Supabase + API básica (Fase 1, semanas 1-2)*
