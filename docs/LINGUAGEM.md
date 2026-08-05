# Linguagem — desktop Work4You

> Passada contínua sobre `wayne-agent/apps/work4you`.
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
| Skills / Capabilities (métodos, learned, Hub) | Habilidades |
| Toolsets / Tools (mãos nativas do motor) | **Fórmula** — não é linguagem de produto na face; o utilizador pede no chat |
| Connectors / Composio / BYO (contas do user) | Conectores — única porta para ligar contas e potenciais |
| MCP (`mcp.json`, catálogo de servers) | Tubagem sob Conectores — **não** aba nem jargão de produto |
| Memory Graph / Starmap | O que aprendi / Learning map |
| YOLO | Aprovar sozinho (copy amigável, não o acrônimo) |
| Profiles | Perfis (mecanismo interno / multi-instância — não “Agent Studio”) |
| Agent Studio | **Morto** — não usar na copy nem na navegação |

Doutrina completa: [`PRODUTO.md` — Fórmula vs Conectores](./PRODUTO.md#fórmula-vs-conectores).

## Já aplicado

- Labels EN em `apps/work4you/src/i18n/en.ts` (cron, artifacts, sidebar, statusbar, command center).
- **Agent Studio removido** da app (rota, view, palette) — 30/07/2026.
- **Banho de marca (UI):** wordmark Work4You no empty state; tema default `work4you` (oliva/carvão); títulos Electron/`en.ts` sem “Hermes” na cara do utilizador. Favicon/ícones de app aguardam asset final.

## Próximos

1. Locale `pt-BR` via `defineLocale()` (parcial → EN fallback).  
2. Alinhar copy da página Personalizar ao destino produto (Skills + Conectores + Subagentes; Tools/MCP fora da face) — ver PRODUTO.md.  
3. Empty states em PT na jornada principal (chat, agenda, entregas).  
4. Revisar tool titles em `ToolTitleKey` para verbs de negócio.
5. Favicon / `assets/icon.*` quando a arte final chegar.
6. Login UI, strip, Composio (produto — fora do banho de marca).

## Fora

- Reescrever o chat React do zero.  
- Reabrir Agent Studio / agentes-por-profile.
- Renomear APIs internas (`hermesDesktop`, IPC `hermes:*`).

---

## Copy visível ao utilizador (obrigatório)

**Regra:** Wayne e Hermes **não** são marca de produto. O utilizador vê **Work4You** (ou *Work*, *agente*, *instância na nuvem*).

| ❌ Nunca na UI / i18n / site público | ✅ Usar |
|---|---|
| Wayne Agent, Motor Wayne | Work4You |
| Hermes Agent, “the Hermes assistant” | Work4You |
| Wayne (como nome do produto) | Work4You |

**Onde aplicar:** `apps/work4you/src/i18n`, `web/src/i18n`, `platform/web` páginas públicas, toasts/erros que mostram texto do motor.

**Sanitizer:** texto cru do backend/plugin passa por `sanitizeProductCopy()` (`@hermes/shared` / `@wayne/shared`) na borda da UI — notificações, slash output, WhatsApp, achievements.

**CI:** `node scripts/check-user-facing-brand.mjs` na raiz do repo.

**Fora deste scope (legado técnico, OK):** paths `~/.wayne`, env `WAYNE_*`, repo `wayne-agent/`, apps Fly `wayne-*`, chaves i18n internas (`updateWayne`).

**Agentes Cursor:** não escrever “Motor Wayne” ou “Wayne Agent” ao falar com o utilizador — dizer *runtime Work4You* ou *motor na nuvem*.
