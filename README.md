# FateSkill

FateSkill é um registo público/privado de pacotes `.skill` para agentes de IA. Funciona como um **"npm para skills de IA"**: autores publicam skills reutilizáveis, utilizadores instalam via CLI, e agentes consomem instruções directamente por API.

## Índice

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitectura](#arquitectura)
- [Stack técnica](#stack-técnica)
- [Estrutura do monorepo](#estrutura-do-monorepo)
- [Começar localmente](#começar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Deploy](#deploy)
- [Formato das skills](#formato-das-skills)
- [Manifesto skill.json](#manifesto-skilljson)
- [API REST](#api-rest)
- [CLI](#cli)
- [Publicar o CLI no npm](#publicar-o-cli-no-npm)
- [Fluxos principais](#fluxos-principais)
- [Integração com IA](#integração-com-ia)
- [Base de dados Supabase](#base-de-dados-supabase)
- [Sistema de visibilidade](#sistema-de-visibilidade)
- [Roadmap](#roadmap)
- [Decisões de arquitectura](#decisões-de-arquitectura)

---

## Visão geral

```text
┌─────────────────────────────────────────────┐
│              WEB (Next.js)                  │  Browse, publicar, gerir
├─────────────────────────────────────────────┤
│              API REST (Next.js routes)      │  Consumo programático
├─────────────────────────────────────────────┤
│              CLI (Node.js → npm)            │  fateskill install <skill>
└─────────────────────────────────────────────┘
         ▼ armazena em ▼
┌─────────────────────────────────────────────┐
│   Supabase (PostgreSQL + Storage + Auth)    │
└─────────────────────────────────────────────┘
```

Sem variáveis Supabase configuradas, a app usa dados de demonstração — útil para desenvolvimento local.

---

## Funcionalidades

- Registry web para descobrir, pesquisar e consultar skills.
- API REST versionada em `/api/v1`.
- CLI oficial (`fateskill`) para autenticar, inicializar, publicar, instalar e pesquisar skills.
- Formato `.skill` simples baseado em ZIP renomeado.
- Manifesto validado com semver, tags, categoria, IA alvo e visibilidade.
- Visibilidade `public`, `unlisted` e `private`.
- Endpoint AI-friendly `/ai-context` para carregar instruções directamente em agentes.
- Schema Supabase com PostgreSQL, Storage, Auth e RLS.

---

## Arquitectura

| Pasta | Conteúdo |
| --- | --- |
| `apps/web` | Next.js 15 com App Router — páginas web e API REST |
| `packages/cli` | CLI TypeScript/Node.js publicado no npm como `fateskill-cli` |
| `supabase/migrations` | Schema SQL inicial |
| `fateskill-architecture.md` | Documento de arquitectura completa |

---

## Stack técnica

| Camada | Tecnologia |
| --- | --- |
| Framework web/API | Next.js 15, App Router |
| UI runtime | React 19 |
| Base de dados | Supabase PostgreSQL |
| Auth | Supabase Auth (GitHub OAuth + magic link) |
| Storage | Supabase Storage |
| Pesquisa | PostgreSQL full-text, `pg_trgm`, `to_tsvector` |
| CLI | Commander.js, Axios, ora, adm-zip, fs-extra, zod, semver |
| Deploy web | Vercel (Node.js 20, npm) |
| Deploy CLI | npm registry |
| Package manager local | pnpm workspaces |
| Linguagem | TypeScript |

---

## Estrutura do monorepo

```text
fateskill/
├── .github/workflows/
│   └── publish-cli.yml          # publica CLI no npm via tag git
├── apps/
│   └── web/                     # Next.js 15 + API REST
│       ├── app/
│       │   ├── (marketing)/     # landing page
│       │   ├── (registry)/      # browse, páginas de skill, perfis
│       │   ├── (dashboard)/     # dashboard, publicar, settings
│       │   └── api/v1/          # endpoints REST
│       ├── lib/                 # registry, supabase, storage, tipos, dados demo
│       └── package.json         # dependências da app web
├── packages/
│   └── cli/                     # CLI Node.js/TypeScript
│       ├── src/
│       │   ├── commands/        # init, login, publish, install, search, info, list
│       │   └── utils/           # empacotamento (.skill) e validação de manifesto
│       └── package.json
├── supabase/migrations/
│   └── 0001_initial_fateskill.sql
├── package.json                 # scripts do monorepo (pnpm workspaces)
├── pnpm-workspace.yaml
├── vercel.json                  # configuração do deploy Vercel
└── .nvmrc                       # Node.js 20
```

---

## Começar localmente

### Pré-requisitos

- Node.js 20 (ver `.nvmrc`)
- pnpm 9.x: `npm install -g pnpm@9.15.9`
- Opcional: projecto Supabase

### Instalação

```bash
pnpm install
```

### Desenvolvimento

```bash
pnpm dev           # inicia a app web em modo dev
pnpm typecheck     # valida TypeScript em todos os workspaces
pnpm build         # build completo (web + CLI)
```

Por workspace:

```bash
pnpm --filter @fateskill/web dev
pnpm --filter @fateskill/web build
pnpm --filter fateskill-cli build
```

---

## Variáveis de ambiente

Cria `apps/web/.env.local` com base em `apps/web/.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
SUPABASE_SKILL_PACKAGES_BUCKET=skill-packages   # opcional, padrão: skill-packages
```

Sem estas variáveis, a app usa dados de demonstração localmente.

---

## Deploy

### Web (Vercel)

O projecto Vercel deve ter **Root Directory definido como `apps/web`** e **Node.js 20.x**.

O `vercel.json` na raiz do repositório está configurado para isso:

```json
{
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

> O build usa **npm** directamente (não pnpm) para evitar incompatibilidades com o ambiente Vercel. A app web tem o seu próprio `package.json` com todas as dependências.

Para configurar o projecto Vercel:

1. Importa o repositório no Vercel.
2. Em **Settings → General → Root Directory** define `apps/web`.
3. Em **Settings → General → Node.js Version** selecciona `20.x`.
4. Adiciona as variáveis de ambiente em **Settings → Environment Variables**.

### CLI (npm)

O CLI é publicado separadamente no npm como `fateskill-cli`. Ver a secção [Publicar o CLI no npm](#publicar-o-cli-no-npm).

---

## Formato das skills

```text
fofa-tabela-docx/
├── skill.json         # manifesto obrigatório
├── SKILL.md           # instruções para a IA (entry point padrão)
├── scripts/           # scripts executáveis opcionais
├── references/        # documentação de referência opcional
└── assets/            # templates, fontes, ícones opcionais
```

Um pacote `.skill` é um ZIP renomeado com este conteúdo:

```text
fofa-tabela-docx-1.2.0.skill  (ZIP)
├── skill.json
├── SKILL.md
└── ...
```

---

## Manifesto skill.json

```json
{
  "name": "fofa-tabela-docx",
  "version": "1.2.0",
  "description": "Formata tabelas FOFA/SWOT em documentos Word académicos moçambicanos",
  "author": "saide",
  "license": "MIT",
  "visibility": "public",
  "tags": ["docx", "academic", "mozambique"],
  "ai": ["claude"],
  "category": "document-processing",
  "entry": "SKILL.md",
  "engines": { "claude": ">=3.0" },
  "repository": "https://github.com/saide/fofa-tabela-docx"
}
```

| Campo | Regra |
| --- | --- |
| `name` | Obrigatório, minúsculas, números e hífen, começa por letra/número |
| `version` | Obrigatório, semver válido |
| `description` | Obrigatório, mínimo 8 caracteres |
| `author` | Obrigatório, mínimo 2 caracteres |
| `visibility` | `public`, `private` ou `unlisted`; padrão `public` |
| `entry` | Ficheiro de entrada; padrão `SKILL.md`, deve existir |

---

## API REST

Base URL:

```
https://fateskill.dev/api/v1
```

### Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/skills` | Listar e pesquisar skills |
| `POST` | `/skills` | Publicar nova skill (requer token) |
| `GET` | `/skills/:name` | Detalhes + última versão |
| `PUT` | `/skills/:name` | Actualizar metadados (requer token) |
| `DELETE` | `/skills/:name` | Remover skill (requer token) |
| `GET` | `/skills/:name/:version` | Versão específica |
| `GET` | `/skills/:name/download` | Descarregar pacote `.skill` |
| `POST` | `/skills/:name/star` | Dar star (requer token) |
| `GET` | `/skills/:name/versions` | Listar versões |
| `GET` | `/skills/:name/content/SKILL.md` | Conteúdo da skill em texto puro |
| `GET` | `/skills/:name/ai-context` | Contexto optimizado para IA |
| `GET` | `/users/:username` | Perfil público |
| `GET` | `/users/:username/skills` | Skills de um utilizador |
| `POST` | `/auth/token` | Criar token de API |

### Filtros de pesquisa

```
GET /skills?q=mozambique&tag=academic&category=document-processing&sort=downloads&page=1&limit=20
```

---

## CLI

O CLI é um binário Node.js publicado no npm. É **independente da app web** — comunica com a API REST do FateSkill via HTTP.

### Instalação global

```bash
npm install -g fateskill-cli
```

### Comandos

```bash
# Autenticação
fateskill login --token <token>
fateskill logout
fateskill whoami

# Criar nova skill localmente
fateskill init --name minha-skill --author saide

# Publicar no registry
fateskill publish
fateskill publish --access private
fateskill publish --dry-run      # valida sem publicar

# Instalar skills
fateskill install fofa-tabela-docx
fateskill install fofa-tabela-docx@1.1.0
fateskill install saide/fofa-tabela-docx

# Descobrir e consultar
fateskill search "docx academic" --sort downloads
fateskill info fofa-tabela-docx
fateskill list                   # skills instaladas localmente

# Em desenvolvimento
fateskill update [nome]
fateskill uninstall <nome>
fateskill token
```

### Como funciona a instalação de skills

O CLI **não usa npm/pnpm** para instalar skills. Usa a API REST:

```
fateskill install fofa-tabela-docx
       ↓
1. GET /api/v1/skills/fofa-tabela-docx     → resolve versão e metadados
2. GET /api/v1/skills/fofa-tabela-docx/download → descarrega .skill (ZIP)
3. Extrai para ~/.fateskill/skills/fofa-tabela-docx/
4. Regista em ~/.fateskill/installed.json
```

### Configuração do CLI

Ficheiro `~/.fateskill/config.json` (criado automaticamente):

```json
{
  "registry": "https://fateskill.dev/api/v1",
  "install_dir": "~/.fateskill/skills",
  "auth_token": "shb_xxxxxxxxxxxx"
}
```

Variáveis de ambiente opcionais:

```bash
FATESKILL_REGISTRY=https://fateskill.dev/api/v1
FATESKILL_INSTALL_DIR=~/.fateskill/skills
FATESKILL_TOKEN=shb_xxxxxxxxxxxx
```

### Build local do CLI

```bash
pnpm --filter fateskill-cli build
# → compila TypeScript para packages/cli/dist/

pnpm --filter fateskill-cli exec fateskill init --name teste
pnpm --filter fateskill-cli exec fateskill publish --dry-run
```

---

## Publicar o CLI no npm

O repositório inclui um workflow GitHub Actions que publica o CLI automaticamente ao criar uma tag `cli@*`.

### Configuração inicial

1. Cria uma conta em [npmjs.com](https://www.npmjs.com) se ainda não tens.
2. Gera um token de acesso: **npm → Account → Access Tokens → Generate New Token → Automation**.
3. Adiciona o token no GitHub: **Settings → Secrets → Actions → `NPM_TOKEN`**.

### Publicar uma versão

```bash
# 1. Actualiza a versão em packages/cli/package.json
# 2. Cria a tag e faz push
git tag cli@1.0.0
git push origin cli@1.0.0
# → GitHub Actions compila e publica fateskill-cli@1.0.0 no npm
```

### Publicação manual

```bash
cd packages/cli
pnpm build
npm publish --access public
```

---

## Integração com IA

### Consumo directo por URL

Qualquer agente com acesso à web pode carregar instruções sem instalar nada:

```
GET https://fateskill.dev/api/v1/skills/fofa-tabela-docx/content/SKILL.md
```

Retorna o `SKILL.md` em texto puro para injecção directa no contexto.

### Padrão de uso em prompt

```
Usa a skill https://fateskill.dev/s/fofa-tabela-docx neste documento.
```

O agente faz fetch à URL, carrega as instruções e executa.

### Endpoint AI-friendly

```
GET /api/v1/skills/:name/ai-context
```

```json
{
  "name": "fofa-tabela-docx",
  "trigger_description": "...",
  "instructions": "... conteúdo do SKILL.md ...",
  "version": "1.2.0",
  "ai_targets": ["claude", "gpt"]
}
```

### MCP Server (fase 2)

Previsto um MCP Server oficial com ferramentas `fateskill_search`, `fateskill_install` e `fateskill_read` para integração nativa com Claude e outros agentes.

---

## Base de dados Supabase

A migração `supabase/migrations/0001_initial_fateskill.sql` cria:

| Tabela | Conteúdo |
| --- | --- |
| `profiles` | Perfis públicos ligados a `auth.users` |
| `skills` | Metadados, visibilidade, tags, contadores |
| `skill_versions` | Versões semver, URL do ficheiro, `is_latest` |
| `skill_stars` | Stars por utilizador |
| `skill_installs` | Analytics de instalação por origem e versão |
| `api_tokens` | Tokens com scopes `read`, `publish`, `admin` |
| `organizations` | Organizações para skills privadas de equipa |
| `org_members` | Membros e roles |

A view `skills_public_view` junta skills, versões e perfis numa query optimizada para a API.

---

## Sistema de visibilidade

| Nível | Comportamento |
| --- | --- |
| `public` | Listado no registo, acessível sem autenticação |
| `unlisted` | Não listado, acessível por URL directa |
| `private` | Só o autor e membros autorizados, requer token |

---

## Roadmap

### Fase 1 — MVP
- [ ] Schema Supabase + RLS completo
- [ ] API REST com autenticação real
- [ ] CLI: `login`, `publish`, `install`, `search`
- [ ] Web: landing, browse, página de skill

### Fase 2 — Registry completo
- [ ] Stars e analytics de downloads
- [ ] Full-text search com `pg_trgm`
- [ ] Dashboard do autor com métricas
- [ ] API tokens com scopes

### Fase 3 — AI-native
- [ ] MCP Server oficial
- [ ] Suporte multi-IA (`claude`, `gpt`, `gemini`)
- [ ] Organizações e skills de equipa
- [ ] CLI `update` e `uninstall` completos

---

## Decisões de arquitectura

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Formato do pacote | ZIP renomeado `.skill` | Simples, sem tooling especial |
| Versionamento | Semver estrito | Padrão da indústria |
| Storage | Supabase Storage | CDN integrado, mesmo stack |
| Pesquisa | PostgreSQL full-text | Sem dependência de Elasticsearch |
| CLI | TypeScript/Node.js | Publicável no npm |
| Auth | Supabase Auth | JWT nativo |
| API | REST JSON | Alta compatibilidade |
| Build Vercel | npm directo em `apps/web` | Evita bug pnpm/Node 24 no Vercel |
