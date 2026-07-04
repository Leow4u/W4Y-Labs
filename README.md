# W4Y Labs — Work4You

Protótipo da plataforma **Work4You**: plataforma multi-tenant e multi-usuário de
**agentes de IA autônomos e persistentes** que aprendem com a experiência,
mantêm memória de longo prazo, executam tarefas em múltiplos ambientes e se
integram a dezenas de ferramentas e modelos — um assistente operacional sempre
ativo.

> Princípio inegociável: **não construímos infraestrutura própria**. Reusamos e
> orquestramos o que já existe no mercado. Ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Estrutura do repositório

```
W4Y Labs/
├── docs/           Arquitetura e roadmap da plataforma
│   ├── ARQUITETURA.md
│   └── ROADMAP.md
├── platform/       UX proprietária da W4Y (7 módulos) + cola de orquestração  [em construção]
└── wayne-agent/    Wayne Agent — o runtime de agentes (fork do Hermes Agent, MIT)
    ├── agent/          loop de conversação, context engine, memória, adapters de modelo
    ├── wayne_cli/      CLI (`wayne`), config, auth, dashboard
    ├── gateway/        gateway multi-plataforma (Telegram, Discord, Slack, WhatsApp...)
    ├── tools/          ferramentas + backends de execução (local/Docker/SSH/Modal/Daytona)
    ├── skills/         skills com loop de aprendizado (padrão agentskills.io)
    ├── plugins/        plugins (model-providers/openrouter, memória, browser, cron...)
    ├── cron/           scheduler de rotinas
    ├── web/ ui-tui/    dashboard por instância e TUI
    ├── docker/         imagem de contêiner por tenant
    ├── tests/          suíte do runtime
    └── docs/           design docs do runtime
```

## Módulos da plataforma (UX proprietária)

1. **Novo Trabalho** — copiloto operacional universal
2. **Agent Studio** — criação de agentes (linguagem natural + templates + workflows)
3. **Rotinas** — agendamentos CRON dos agentes (motor: `wayne-agent/cron/`)
4. **Artefatos** — saídas geradas
5. **Conectores** — integrações via Composio (MCP)
6. **Uso** — custo em tempo real (Langfuse)
7. **Observabilidade** — traces e qualidade (Langfuse)

## Wayne Agent — quickstart (dev)

```bash
cd wayne-agent
# requisitos: Python 3.11–3.13, uv, Node 22+
uv sync                 # instala o runtime
uv run wayne            # CLI interativa
uv run wayne gateway    # gateway (Telegram, Discord, Slack, WhatsApp...)
uv run wayne doctor     # diagnóstico
```

Modelos via **OpenRouter** (`OPENROUTER_API_KEY`), estado em `~/.wayne`
(Windows: `%LOCALAPPDATA%\wayne`), configuração via `wayne config` /
`cli-config.yaml`.

## Créditos

O **Wayne Agent** deriva do [**Hermes Agent**](https://github.com/NousResearch/hermes-agent)
da **Nous Research** (MIT) — licença original preservada em
[wayne-agent/LICENSE-UPSTREAM](wayne-agent/LICENSE-UPSTREAM); detalhes em
[wayne-agent/CREDITS.md](wayne-agent/CREDITS.md) e decisões do fork em
[wayne-agent/FORK-NOTES.md](wayne-agent/FORK-NOTES.md).
