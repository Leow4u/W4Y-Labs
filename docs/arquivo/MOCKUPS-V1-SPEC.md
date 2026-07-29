# Mockups v1 — Spec interativa (pré-Fase 10)

Galeria de telas-alvo da auditoria Fase 9, renderizada **dentro do produto real**
(`wayne-agent/web`) com o mesmo design system Editorial — não HTML estático separado.

## Objetivo

Validar visualmente o produto v1 **antes** do roadmap de implementação (Fase 10):

- Sidebar flat (zero dropdown)
- Shells com abas internas
- Relay/MAX · Entregas · Config Cursor parity
- Dados fictícios — sem backend

## Como abrir

```bash
cd wayne-agent/web
npm run dev
```

Navegar para: **`/mockups/v1`**

## Escopo das telas

| Rota mock | Wireframe Fase 9 | Estado-alvo |
|-----------|------------------|-------------|
| `/mockups/v1/chat-hero` | §2 Nova tarefa hero | Relay · footer créditos · Ambiente colapsado |
| `/mockups/v1/chat-session` | §3 Sessão ativa | Ambiente expandido · subagentes · toolbar unificada |
| `/mockups/v1/entregas` | §4 Entregas | Layer Entregas/Workspace · agrupamento por tarefa |
| `/mockups/v1/integracoes` | §5 Integrações | 3 abas · carousel PT · featured BR |
| `/mockups/v1/agentes` | §6 Agentes | Equipe · Trabalho · Governança |
| `/mockups/v1/agenda` | §7 Agenda | Rotinas · blueprints PT · ponte agente |
| `/mockups/v1/config` | §8 Config modal | 14 seções flat incl. Modelos |

## Princípios

1. **Reutilizar** tokens CSS (`index.css`), `@nous-research/ui`, tipografia Editorial.
2. **Isolar** — rotas `/mockups/*` não alteram nav produção.
3. **Banner** “Spec preview” visível em todas as telas.
4. **Fixture data** em `mock-data.ts` — espelha copy PT da auditoria.
5. **Não** substituir Fase 10 — mocks são acceptance criteria visual.

## Relação com implementação

| Mock | Onda backlog |
|------|--------------|
| Shell sidebar flat | Onda A |
| Relay/MAX + usage footer | Onda B |
| Entregas layer | Onda C |
| Config Modelos | Onda A + C |
| Pontes deep links | Onda D |

## Definition of Done

- [x] Spec deste documento
- [x] Galeria `/mockups/v1` navegável
- [x] 7 telas renderizadas
- [x] Banner spec + link de volta ao índice
- [x] Referência cruzada em `AUDITORIA-PRODUTO-WORK4YOU.md`
