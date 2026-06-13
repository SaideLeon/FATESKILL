# fateskill-cli

CLI oficial do [FateSkill](https://fateskill.vercel.app) — o "npm para skills de IA". Permite autenticar, inicializar, publicar, instalar e pesquisar pacotes `.skill` para agentes de IA como o Claude.

## Instalação

```bash
npm install -g fateskill-cli
```

Verifica a instalação:

```bash
fateskill --version
```

## Configuração

Na primeira execução, o CLI cria `~/.fateskill/config.json`:

```json
{
  "registry": "https://fateskill.vercel.app/api/v1",
  "install_dir": "~/.fateskill/skills"
}
```

### Variáveis de ambiente opcionais

```bash
FATESKILL_REGISTRY=https://fateskill.vercel.app/api/v1
FATESKILL_INSTALL_DIR=~/.fateskill/skills
FATESKILL_TOKEN=shb_xxxxxxxxxxxx
```

## Autenticação

```bash
fateskill login --token <token>
fateskill whoami
fateskill logout
```

O token pode ser criado via API (`POST /auth/token`) ou no dashboard web do FateSkill.

## Criar uma nova skill

```bash
mkdir minha-skill && cd minha-skill
fateskill init --name minha-skill --author saide
```

Gera dois ficheiros:

- `skill.json` — manifesto (nome, versão, descrição, autor, tags, visibilidade, etc.)
- `SKILL.md` — instruções para a IA, ponto de entrada da skill

Estrutura opcional adicional:

```text
minha-skill/
├── skill.json
├── SKILL.md
├── scripts/       # scripts executáveis opcionais
├── references/    # documentação de referência opcional
└── assets/        # templates, fontes, ícones opcionais
```

## Publicar uma skill

```bash
# valida e empacota sem publicar
fateskill publish --dry-run

# publica como público (padrão)
fateskill publish

# publica como privado
fateskill publish --access private
```

O comando:

1. Lê e valida `skill.json` (nome, semver, descrição, autor).
2. Empacota a pasta num ficheiro `.skill` (ZIP) em `.fateskill/`.
3. Faz upload do pacote para o storage do registry.
4. Publica os metadados via `POST /api/v1/skills`.

## Instalar skills

```bash
# última versão
fateskill install fofa-tabela-docx

# versão específica
fateskill install fofa-tabela-docx@1.1.0

# por autor
fateskill install saide/fofa-tabela-docx
```

As skills instaladas são extraídas para `~/.fateskill/skills/<nome>/` e registadas em `~/.fateskill/installed.json`.

## Pesquisar e consultar

```bash
# pesquisa por texto, ordenada por downloads
fateskill search "docx academic" --sort downloads

# filtros adicionais
fateskill search "docx" --tag academic --category document-processing

# detalhes de uma skill
fateskill info fofa-tabela-docx

# listar skills instaladas localmente
fateskill list
```

## Referência de comandos

| Comando | Descrição |
| --- | --- |
| `fateskill login --token <token>` | Autentica o CLI com um token de API |
| `fateskill logout` | Remove o token guardado |
| `fateskill whoami` | Mostra o estado de autenticação e o registry activo |
| `fateskill init --name <nome> --author <autor>` | Cria `skill.json` e `SKILL.md` na pasta atual |
| `fateskill publish [--access public\|private\|unlisted] [--dry-run]` | Empacota e publica a skill atual |
| `fateskill install <spec>` | Instala uma skill (`nome`, `nome@versão` ou `autor/nome`) |
| `fateskill search <query> [--tag] [--category] [--sort]` | Pesquisa skills no registry |
| `fateskill info <nome>` | Mostra detalhes de uma skill |
| `fateskill list` | Lista skills instaladas localmente |
| `fateskill update [nome]` | _(em desenvolvimento)_ |
| `fateskill uninstall <nome>` | _(em desenvolvimento)_ |
| `fateskill token` | _(em desenvolvimento)_ |

## Formato do manifesto `skill.json`

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

## Consumo por agentes de IA

Qualquer agente com acesso à web pode carregar instruções de uma skill publicada sem instalar nada:

```
GET https://fateskill.vercel.app/api/v1/skills/<nome>/content/SKILL.md
GET https://fateskill.vercel.app/api/v1/skills/<nome>/ai-context
```

## Mais informação

Repositório e documentação completa: [github.com/SaideLeon/FATESKILL](https://github.com/SaideLeon/FATESKILL)

## Licença

MIT
