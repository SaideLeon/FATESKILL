# SkillHub

SkillHub é um registo público/privado de pacotes `.skill` para agentes de IA. A proposta é funcionar como um **“npm para skills de IA”**: autores publicam skills reutilizáveis, utilizadores instalam via CLI, e agentes podem consumir instruções diretamente por API.

## Índice

- [Visão geral](#visão-geral)
- [Funcionalidades principais](#funcionalidades-principais)
- [Arquitetura](#arquitetura)
- [Stack técnica](#stack-técnica)
- [Estrutura do monorepo](#estrutura-do-monorepo)
- [Começar localmente](#começar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Formato das skills](#formato-das-skills)
- [Manifesto `skill.json`](#manifesto-skilljson)
- [Formato do pacote `.skill`](#formato-do-pacote-skill)
- [API REST](#api-rest)
- [CLI](#cli)
- [Fluxos principais](#fluxos-principais)
- [Integração com IA](#integração-com-ia)
- [Base de dados Supabase](#base-de-dados-supabase)
- [Sistema de visibilidade](#sistema-de-visibilidade)
- [Roadmap](#roadmap)
- [Decisões de arquitetura](#decisões-de-arquitetura)

## Visão geral

O SkillHub combina três camadas principais:

```text
┌─────────────────────────────────────────────┐
│              WEB (Next.js)                  │  Browse, publicar, gerir
├─────────────────────────────────────────────┤
│              API REST (Next.js routes)      │  Consumo programático
├─────────────────────────────────────────────┤
│              CLI (Node.js → npm)            │  skillhub install <skill>
└─────────────────────────────────────────────┘
         ▼ armazena em ▼
┌─────────────────────────────────────────────┐
│   Supabase (PostgreSQL + Storage + Auth)    │
└─────────────────────────────────────────────┘
```

A aplicação também funciona em modo de desenvolvimento sem Supabase configurado: quando as variáveis de ambiente não existem, a web/API usa dados de demonstração para facilitar testes locais.

## Funcionalidades principais

- **Registry web** para descobrir, pesquisar e consultar skills.
- **API REST versionada** em `/api/v1` para consumo por clientes externos e agentes.
- **CLI oficial** (`skillhub`) para autenticar, inicializar, publicar, instalar, pesquisar e listar skills.
- **Formato `.skill` simples**, baseado em ZIP renomeado.
- **Manifesto validado** com nome, versão semver, autor, tags, categoria, IA alvo e visibilidade.
- **Suporte a visibilidade** `public`, `unlisted` e `private`.
- **Endpoint AI-friendly** para carregar contexto de uma skill em agentes de IA.
- **Schema Supabase** com PostgreSQL, Storage/Auth-ready e RLS.

## Arquitetura

- `apps/web`: aplicação Next.js 15 com App Router, páginas web e rotas REST.
- `packages/cli`: CLI TypeScript/Node.js publicável no npm como `skillhub-cli`.
- `supabase/migrations`: schema inicial do PostgreSQL/Supabase.
- `skillhub-architecture.md`: documento de arquitetura completa que originou esta implementação.

## Stack técnica

| Camada | Tecnologia |
| --- | --- |
| Framework web/API | Next.js 15 com App Router |
| UI runtime | React 19 |
| Base de dados | Supabase PostgreSQL |
| Auth | Supabase Auth, com suporte previsto a GitHub OAuth e magic link |
| Storage | Supabase Storage, com buckets previstos `skills-public` e `skills-private` |
| Pesquisa | PostgreSQL full-text, `pg_trgm` e `to_tsvector` |
| CLI | Commander.js, Axios, ora, adm-zip, fs-extra, zod e semver |
| Deploy | Vercel |
| Package manager | pnpm workspaces |
| Linguagem | TypeScript |

## Estrutura do monorepo

```text
skillhub/
├── apps/
│   └── web/                         # Next.js 15 + API REST
│       ├── app/
│       │   ├── (marketing)/         # landing page
│       │   ├── (registry)/          # browse, páginas de skill e perfis
│       │   ├── (dashboard)/         # dashboard, publicar e settings
│       │   └── api/v1/              # endpoints REST
│       └── lib/                     # registry, Supabase, storage, tipos e dados demo
├── packages/
│   └── cli/                         # CLI Node.js/TypeScript
│       ├── src/commands/            # comandos skillhub
│       ├── src/utils/               # empacotamento e manifesto
│       └── package.json
├── supabase/migrations/             # schema SQL inicial
├── package.json                     # scripts do monorepo
├── pnpm-workspace.yaml
├── vercel.json
└── skillhub-architecture.md
```

## Começar localmente

### Pré-requisitos

- Node.js compatível com Next.js 15.
- pnpm `9.15.9` ou versão compatível.
- Opcional: projeto Supabase para persistência real.

### Instalação

```bash
pnpm install
```

### Desenvolvimento web

```bash
pnpm dev
```

O comando executa a aplicação web (`@skillhub/web`) em modo de desenvolvimento.

### Build e validações

```bash
pnpm typecheck
pnpm build
```

Também é possível executar scripts por workspace:

```bash
pnpm --filter @skillhub/web typecheck
pnpm --filter @skillhub/web build
pnpm --filter skillhub-cli typecheck
pnpm --filter skillhub-cli build
```

## Variáveis de ambiente

Crie um ficheiro `.env.local` em `apps/web` com base em `apps/web/.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
```

Sem estas variáveis, a aplicação usa dados de demonstração.

## Formato das skills

Uma skill publicada no registry deve seguir esta estrutura:

```text
fofa-tabela-docx/
├── skill.json         # manifesto obrigatório
├── SKILL.md           # instruções para a IA, obrigatório por padrão
├── scripts/           # scripts executáveis opcionais
├── references/        # documentação de referência opcional
└── assets/            # templates, fontes, ícones e outros assets opcionais
```

## Manifesto `skill.json`

Exemplo completo:

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
  "homepage": "https://skillhub.dev/skills/fofa-tabela-docx"
}
```

Regras implementadas no validador do CLI:

| Campo | Regra |
| --- | --- |
| `name` | Obrigatório, mínimo 2 caracteres, apenas minúsculas, números e hífen, começando por letra/número |
| `version` | Obrigatório, semver válido |
| `description` | Obrigatório, mínimo 8 caracteres |
| `author` | Obrigatório, mínimo 2 caracteres |
| `license` | Padrão `MIT` |
| `visibility` | `public`, `private` ou `unlisted`; padrão `public` |
| `tags` | Lista de strings; padrão `[]` |
| `ai` | Lista de IAs alvo; padrão `["claude"]` |
| `category` | Padrão `uncategorized` |
| `entry` | Ficheiro de entrada; padrão `SKILL.md` e deve existir |
| `engines` | Opcional |
| `repository` | URL opcional |
| `homepage` | URL opcional |

## Formato do pacote `.skill`

Um ficheiro `.skill` é um ZIP renomeado contendo a pasta da skill:

```text
fofa-tabela-docx-1.2.0.skill
└── skill.json
└── SKILL.md
└── scripts/
└── references/
└── assets/
```

## API REST

Base URL planeada em produção:

```text
https://skillhub.dev/api/v1
```

### Endpoints disponíveis/planeados no MVP

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/skills` | Listar e pesquisar skills |
| `POST` | `/skills` | Publicar nova skill, com autenticação/token |
| `GET` | `/skills/:name` | Obter detalhes da skill e última versão |
| `PUT` | `/skills/:name` | Atualizar metadados, com autenticação |
| `DELETE` | `/skills/:name` | Remover skill, com autenticação |
| `GET` | `/skills/:name/:version` | Obter versão específica |
| `GET` | `/skills/:name/download` | Redirecionar/servir o pacote `.skill` |
| `POST` | `/skills/:name/star` | Dar star, com autenticação |
| `GET` | `/skills/:name/versions` | Listar versões da skill |
| `GET` | `/skills/:name/content/:file` | Ler ficheiro de conteúdo da skill |
| `GET` | `/skills/:name/ai-context` | Obter contexto otimizado para IA |
| `GET` | `/users/:username` | Perfil público do utilizador |
| `GET` | `/users/:username/skills` | Skills publicadas por um utilizador |
| `POST` | `/auth/token` | Criar token de API |

### Pesquisa de skills

`GET /skills` aceita filtros como:

```text
?q=mozambique docx
?tag=academic
?category=document-processing
?author=saide
?sort=downloads|stars|recent
?page=1&limit=20
```

### Exemplo de resposta

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
  "entry_url": "https://skillhub.dev/api/v1/skills/fofa-tabela-docx/content/SKILL.md",
  "download_url": "https://skillhub.dev/api/v1/skills/fofa-tabela-docx/download",
  "versions": ["1.0.0", "1.1.0", "1.2.0"],
  "updated_at": "2026-05-10T14:32:00Z"
}
```

## CLI

### Build local

```bash
pnpm --filter skillhub-cli build
```

### Execução local

```bash
pnpm --filter skillhub-cli exec skillhub init --name minha-skill
pnpm --filter skillhub-cli exec skillhub publish --dry-run
pnpm --filter skillhub-cli exec skillhub search "docx academic"
```

### Instalação global planeada

```bash
npm install -g skillhub-cli
```

### Comandos

```bash
# Autenticação
skillhub login --token <token>
skillhub logout
skillhub whoami

# Inicializar nova skill
skillhub init --name minha-skill --author saide

# Publicar
skillhub publish
skillhub publish --access private
skillhub publish --dry-run

# Instalar
skillhub install fofa-tabela-docx
skillhub install fofa-tabela-docx@1.1.0
skillhub install saide/fofa-tabela-docx

# Descobrir e consultar
skillhub search "docx academic" --tag academic --category document-processing --sort downloads
skillhub info fofa-tabela-docx
skillhub list

# Planeados no CLI
skillhub update
skillhub update fofa-tabela-docx
skillhub uninstall fofa-tabela-docx
skillhub token
```

### Configuração do CLI

O CLI usa `~/.skillhub/config.json`:

```json
{
  "registry": "https://skillhub.dev/api/v1",
  "install_dir": "~/.skillhub/skills",
  "auth_token": "shb_xxxxxxxxxxxx"
}
```

Também é possível alterar os padrões por variáveis de ambiente:

- `SKILLHUB_REGISTRY`
- `SKILLHUB_INSTALL_DIR`

O ficheiro `~/.skillhub/installed.json` regista skills instaladas localmente.

## Fluxos principais

### Publicação

```text
1. Autor cria uma skill localmente com SKILL.md + skill.json.
2. skillhub publish valida o manifesto, incluindo semver e campos obrigatórios.
3. O CLI empacota a pasta num ficheiro .skill.
4. O CLI envia POST /api/v1/skills com token de API.
5. A API valida token e scopes.
6. A API insere/atualiza skills e cria a versão em skill_versions.
7. O pacote é disponibilizado via Supabase Storage/CDN.
```

### Instalação

```text
skillhub install fofa-tabela-docx

1. GET /api/v1/skills/fofa-tabela-docx resolve a última versão.
2. GET /api/v1/skills/fofa-tabela-docx/download obtém o pacote .skill.
3. O CLI descarrega e extrai o ZIP.
4. A skill é instalada em ~/.skillhub/skills/fofa-tabela-docx/ por padrão.
5. O CLI regista a instalação em ~/.skillhub/installed.json.
```

## Integração com IA

### Consumo direto por URL

Agentes com acesso à web podem carregar instruções diretamente:

```text
GET https://skillhub.dev/api/v1/skills/fofa-tabela-docx/content/SKILL.md
```

Isto retorna o `SKILL.md` em texto puro, pronto para ser injetado no contexto do agente.

### Padrão de uso em prompt

```text
Usa a skill https://skillhub.dev/s/fofa-tabela-docx neste documento.
```

O agente pode resolver a URL, carregar o `SKILL.md` e aplicar as instruções.

### Endpoint AI-friendly

```text
GET /api/v1/skills/:name/ai-context
```

Resposta esperada:

```json
{
  "name": "fofa-tabela-docx",
  "trigger_description": "...",
  "instructions": "... conteúdo SKILL.md ...",
  "version": "1.2.0"
}
```

### MCP Server previsto

Uma fase futura prevê um MCP Server oficial com ferramentas como:

```json
{
  "tools": [
    {
      "name": "skillhub_search",
      "description": "Pesquisar skills no SkillHub registry"
    },
    {
      "name": "skillhub_install",
      "description": "Instalar skill e carregar instruções no contexto"
    },
    {
      "name": "skillhub_read",
      "description": "Ler conteúdo de uma skill pelo nome"
    }
  ]
}
```

## Base de dados Supabase

A migração inicial define tabelas para:

- `profiles`: perfis públicos ligados a `auth.users`.
- `skills`: metadados principais, visibilidade, tags, contadores e autor.
- `skill_versions`: versões semver, URL do ficheiro, tamanho e estado `is_latest`.
- `skill_stars`: stars por utilizador.
- `skill_installs`: analytics de instalação.
- `api_tokens`: tokens com scopes `read`, `publish` e `admin`.
- `organizations`: organizações para skills privadas de equipa.
- `org_members`: membros e roles de organização.

A arquitetura prevê RLS para:

- leitura pública de skills `public`;
- acesso restrito a skills privadas;
- gestão de skills pelo autor;
- suporte futuro a membros de organizações.

## Sistema de visibilidade

| Nível | Comportamento |
| --- | --- |
| `public` | Listado no registo e acessível sem autenticação |
| `unlisted` | Não listado, mas acessível por URL direta |
| `private` | Acessível apenas pelo autor e membros autorizados, requer token |

## Roadmap

### Fase 1 — MVP

- [ ] Schema Supabase + RLS.
- [ ] API REST básica para CRUD de skills e download.
- [ ] CLI com `login`, `publish`, `install` e `search`.
- [ ] Web com landing, browse e página de detalhe da skill.
- [ ] Auth via Supabase.

### Fase 2 — Registry completo

- [ ] Versionamento semver completo.
- [ ] Sistema de stars.
- [ ] Analytics de downloads por versão e país.
- [ ] Full-text search com `pg_trgm`.
- [ ] Dashboard do autor.
- [ ] API tokens com scopes.

### Fase 3 — AI-native

- [ ] MCP Server oficial.
- [ ] Endpoint `/ai-context` completo.
- [ ] Suporte multi-IA, por exemplo `claude`, `gpt` e `gemini`.
- [ ] Organizações e skills de equipa.
- [ ] CLI com `update` e `list` completos.

### Monetização opcional

- Skills pagas por compra única ou subscrição via Stripe.
- Plano Pro com skills privadas ilimitadas e analytics detalhados.
- Organizações com gestão de equipa e SSO.

## Decisões de arquitetura

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Formato do pacote | ZIP renomeado `.skill` | Simples, sem dependência de tooling especial |
| Versionamento | Semver estrito | Padrão da indústria e compatível com ecossistema npm |
| Storage | Supabase Storage | CDN integrado e alinhado ao stack |
| Pesquisa | PostgreSQL full-text | Evita dependência inicial de Elasticsearch |
| CLI | TypeScript/Node.js | Publicável no npm e familiar ao stack |
| Auth | Supabase Auth | JWT nativo e integração simples |
| API | REST JSON | Alta compatibilidade com clientes e agentes |

## Exemplo completo de uso

```bash
# Autor publica
cd ~/skills/fofa-tabela-docx
skillhub publish
# → fofa-tabela-docx@1.2.0 publicado
# → https://skillhub.dev/skills/fofa-tabela-docx

# Utilizador instala
skillhub install fofa-tabela-docx
# → instalado em ~/.skillhub/skills/fofa-tabela-docx/

# IA consome via API
# GET /api/v1/skills/fofa-tabela-docx/content/SKILL.md
# → executa as instruções diretamente
```
