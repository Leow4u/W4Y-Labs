# Linguagem — desktop Work4You

> Passada contínua sobre `wayne-agent/apps/desktop`.
> Não reinventar telas — **renomear, esconder, reordenar**.

## Princípio

**Humanizar ≠ infantilizar.** Tom claro e profissional; capacidades intactas.
Jargão só some onde atrapalha a jornada — não “simplificar” o produto nem
esconder poder atrás de copy condescendente.

**Para quem escrevemos:** programadores e utilizadores técnicos (ver
[`PRODUTO.md`](./PRODUTO.md)). "Acessível" aqui significa *sem ruído*, nunca
*para principiantes*. Não explicamos o que é um commit, um branch ou uma chave
de API. Renomear um rótulo obscuro é bom; explicar o óbvio é condescendência.

## Glossário (técnico → linguagem humana)

| Eng / legado | Work4You |
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

## Já aplicado

- Labels EN em `apps/desktop/src/i18n/en.ts` (cron, artifacts, sidebar, statusbar, command center).
- Entrada **Agent Studio** na command palette + rota `/agent-studio`.
- **Banho de marca (UI):** wordmark Work4You no empty state; tema default `work4you` (oliva/carvão); títulos Electron/`en.ts` sem “Hermes” na cara do utilizador. Favicon/ícones de app aguardam asset final.

## Próximos

1. Locale `pt-BR` via `defineLocale()` (parcial → EN fallback).  
2. Esconder jargão (MCP, YOLO, tool schemas) atrás de `?full=1` ou Settings avançado.  
3. Empty states em PT na jornada principal (chat, agenda, entregas).  
4. Revisar tool titles em `ToolTitleKey` para verbs de negócio.
5. Favicon / `assets/icon.*` quando a arte final chegar.
6. Login UI, strip, Composio (produto — fora do banho de marca).

## Fora

- Reescrever o chat React do zero.  
- Construir Studio no `desktop-shell`.
- Renomear APIs internas (`hermesDesktop`, IPC `hermes:*`).
