# SkillHub

SkillHub é um registo público/privado de `.skill` packages para agentes de IA, com:

- **Web + API REST** em Next.js 15 (`apps/web`)
- **CLI Node.js** publicável no npm (`packages/cli`)
- **Schema Supabase** com PostgreSQL, Storage/Auth-ready e RLS (`supabase/migrations`)

## Comandos

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```

## API MVP

- `GET /api/v1/skills`
- `GET /api/v1/skills/:name`
- `GET /api/v1/skills/:name/:version`
- `GET /api/v1/skills/:name/download`
- `POST /api/v1/skills`
- `GET /api/v1/skills/:name/versions`
- `GET /api/v1/skills/:name/ai-context`
- `GET /api/v1/users/:username`
- `POST /api/v1/auth/token`

Sem variáveis Supabase, a aplicação usa dados de demonstração para facilitar desenvolvimento local.

## CLI

```bash
pnpm --filter skillhub-cli build
pnpm --filter skillhub-cli exec skillhub init --name minha-skill
pnpm --filter skillhub-cli exec skillhub publish --dry-run
```
