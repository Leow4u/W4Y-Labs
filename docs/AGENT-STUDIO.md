# Agent Studio — próxima construção de produto

> **Status:** especificação de destino. Implementação **depois** da base desktop Hermes
> (opção A) + deltas W4Y estáveis. Ver [PLATAFORMA.md](./PLATAFORMA.md) e
> [PLANO-REPARO.md](./PLANO-REPARO.md) Fase 5.
>
> Não construir no `desktop-shell` legado. Entrypoint de produto: renderer
> `wayne-agent/apps/desktop` (+ superfície web como janela da nuvem, se couber).

---

## Papel no modelo mental

1. Hermes desktop = base (capacidades + UI nativa).  
2. Linguagem acessível PME = humanizar essa base.  
3. **Agent Studio** = produto Work4You novo: criar e orquestrar agentes sem virar “painel de eng”.

Alinha com [ROADMAP.md](./ROADMAP.md) §2.

---

## Escopo (produto)

| Fase | Entrega |
|---|---|
| **F1** | Criar agente por linguagem natural → config Wayne (prompt, modelo OpenRouter, skills, MCPs) em Cloud SQL; templates 1-clique (seed dos blueprints) → ativar (provisiona perfil/serviço) |
| **F2** | Canvas ReactFlow → compila workflow p/ config + delegação; testar no Studio |
| **F3** | Versionamento, A/B, marketplace |

**Reusar:** Wayne blueprints/subagentes · ReactFlow · Cloud SQL · Cloud Run · OpenRouter · Composio (MCP).

**Cola a construir:** gerador “NL → config”; compilador ReactFlow → config/delegação.

---

## Fora de escopo (até a base shipar)

- Reimplementar Studio no `desktop-shell` ou só no `web_dist` como app principal do PC.  
- Nova casca Electron paralela.  
- Experimentos (`w4y-studio/`, `model-experience-poc/`) como caminho oficial — promover ideias para cá só após triagem.

---

## Critério de “pode começar F1”

- [x] `apps/desktop` no tree (PR1 restaurado; pack Windows = follow-up após npm install)  
- [ ] Login Work4You + motor ZIP no desktop Hermes  
- [ ] Ponte nuvem básica (lançar/acompanhar)  
- [ ] Update GCS sem state-machine nova  
- [x] `desktop-shell` em stop-ship (`apps/desktop-shell/STOP-SHIP.md`)  

---

## Entrypoint (scaffold)

- Doc de produto: este arquivo.  
- Desktop Hermes: rota `/agent-studio` + command palette **Agent Studio** + empty state
  (`apps/desktop/src/app/agent-studio`). Sem canvas até F2.
