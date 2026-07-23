# Linguagem acessível PME — desktop Hermes

> Passada contínua sobre `wayne-agent/apps/desktop` (opção A).  
> Não reinventar telas — **renomear, esconder, reordenar**.

## Glossário (técnico → PME)

| Hermes / eng | Work4You PME |
|---|---|
| Cron / cron jobs | Agenda / Schedule |
| Artifacts | Entregas / Deliverables |
| Command Center | Painel de controlo / Control panel |
| Messaging | Canais |
| Skills / Capabilities | Habilidades |
| Memory Graph / Starmap | O que aprendi / Learning map |
| YOLO | Aprovar sozinho (copy amigável, não o acrônimo) |
| MCP | Integrações avançadas (`?full=1` / power user) |
| Profiles | Equipe / Agentes (quando for lista de pessoas-agente) |

## Já aplicado (PR desta onda)

- Labels EN em `apps/desktop/src/i18n/en.ts` (cron, artifacts, sidebar, statusbar, command center).
- Entrada **Agent Studio** na command palette + rota `/agent-studio`.

## Próximos

1. Locale `pt-BR` via `defineLocale()` (parcial → EN fallback).  
2. Esconder jargão (MCP, YOLO, tool schemas) atrás de `?full=1` ou Settings avançado.  
3. Empty states em PT na jornada principal (chat, agenda, entregas).  
4. Revisar tool titles em `ToolTitleKey` para verbs de negócio.

## Fora

- Reescrever o chat React do zero.  
- Construir Studio no `desktop-shell`.
