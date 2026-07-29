# Work4You — Arquitetura de Billing & Modelo de Negócio

> Referência oficial (2026-07-07, **atualizado 2026-07-24** — face UI alinhada ao Cursor).
> Fechado com o Leonardo. Números são **estimativas de planejamento**; a **arquitetura e a lógica de margem** estão decididos. Câmbio assumido ~R$5,5/US$.

## ⚠️ Atualização v3 — face UI Cursor + on-demand (24/07/2026)

A **face** do produto deixa de espelhar Manus (créditos / Relay·MAX / Hobby·Pro·Business como vocabulário principal).

| Face antiga (cancelada na UI) | Face nova (Cursor-like) |
|---|---|
| Créditos Manus | **Plan & Usage**: included → esgota → on-demand |
| Relay / MAX como tiers de produto | Modelos no picker (Settings → Modelos) |
| Contas/Chaves = OAuth de LLM | **Conta** = perfil Work4You + Plan & Usage |

Infra por baixo (chave OpenRouter por tenant com teto, Stripe) **permanece**. Settings → Conta lê plano via `/api/account/plan`, medidor included via gateway `usage.account`, Upgrade → `/planos`, Manage → `/planos/portal` (Stripe Customer Portal).

**On-demand + spend limit (v1 + metered MVP):** Conta liga on-demand e define teto \$/ciclo (\PATCH /planos/spend-limit\ → ceiling OpenRouter). Caps: starter \ · pro \ · max \. No \invoice.paid\, o overage do ciclo anterior é reportado via Stripe Billing Meter (\w4y_ondemand_overage_cent\, price \price_1Twvq8Cn608ngT3WHeZov3BZ\ a \.01/unidade) e aparece na **próxima fatura**. Env: \STRIPE_PRICE_OVERAGE\. Conta diz: reportado no fim do ciclo, cobrado na próxima fatura. Command Center → Usage = telemetria Hermes (não billing).

## ⚠️ Atualização v2 — vocabulário UI (jul/2026) — legado

A auditoria produto (**Fase 10**) substitui na **interface**:

| Antes (doc v1) | Agora (UI PT) | Plano platform |
|----------------|---------------|----------------|
| Flash / Auto / Expert / Crew | **Relay ⭐** / **MAX** | — |
| Essencial | **Hobby** | free / starter |
| Pro | **Pro** | pro |
| Business | **Business** | max |
| Crew (tier) | *(removido da UI)* → capacidade **Agentes** (esquadrão, delegate) | Business |

**Relay ⭐** = preset `auto` (roteador; todos os planos). **MAX** = preset `expert` + reasoning alto (Pro+).  
Créditos, teto OpenRouter por tenant e Stripe **permanecem** — só mudam labels e gating no menu.

Implementação: `web/src/lib/tier-presets.ts`, `TierPicker`→Relay picker, `ConfigUser` → Modelos, `docs/AUDITORIA-PRODUTO-WORK4YOU.md` Fase 10.

---

## 1. Princípios (decididos)

1. **Créditos, nunca dólar.** O usuário vê "créditos" (estilo Manus). O custo financeiro real
   (OpenRouter/infra) fica escondido. Créditos escondem a volatilidade e embutem a margem.
2. **Teto rígido via chave OpenRouter por tenant.** Cada tenant usa uma chave OpenRouter
   **provisionada com limite de gasto**. É um teto físico em US$ — o tenant **não consegue**
   gastar além do plano. **Nunca perdemos dinheiro** além do allowance. É o pilar de proteção.
3. **Tiers próprios escondem as LLMs.** Na UI v2: **Relay** e **MAX** (antes Flash/Auto/Expert/Crew). Trocamos a LLM por trás sem o usuário perceber.
4. **Relay é o padrão.** Melhor UX (sem fricção) e melhor margem (roteia barato quando dá).
5. **Gating por plano = upsell.** MAX (Pro+) puxa upgrade. Multi-agente = **Agentes**, não tier.

## 2. Tiers UI v2 (Relay · MAX) — mapeamento interno

| UI | Preset legacy | LLM por trás (ex.) | Esforço | Agentes | Plano |
|---|---|---|---|---|---|
| **Relay ⭐** | Auto | Flash ↔ Expert (roteador) | auto | 1 | todos *(padrão)* |
| **MAX** | Expert | Claude Sonnet/Opus | alto | 1 | Pro+ |

Multi-agente (esquadrão, `delegate_task`, team.json) → módulo **Agentes**, gated Business — **não** é pill no composer.

---

## 2b. Tiers legacy (Flash · Auto · Expert · Crew) — referência interna

> Mantido para migration de config e código backend até PR B1. **Não exibir na UI v1.**

| Tier | Subtítulo | LLM por trás (ex., trocável) | Esforço | Agentes | Consumo de crédito | Disponível em |
|---|---|---|---|---|---|---|
| **Flash** | Respostas rápidas | Gemini Flash / DeepSeek | baixo | 1 | baixo (~poucos cr/msg) | todos |
| **Auto** ⭐ | Escolhe por você | Flash ↔ Expert (por tarefa) | auto | 1 | variável | todos *(padrão)* |
| **Expert** | Pensa fundo | Claude Sonnet/Opus | alto | 1 | ~alto | Pro+ |
| **Crew** | Time de especialistas | Claude + subagentes | alto | 3–5 | ~muito alto | Business |

O consumo de crédito é **proporcional ao custo real** (Claude custa ~15–30× o modelo barato) +
um plus de margem nos tiers premium. Assim ninguém "gasta Opus a preço de Flash".

**Menu (estilo Grok):** tier bloqueado pelo plano aparece esmaecido + cadeado + chip
"**Fazer upgrade para desbloquear**" — upsell no ponto exato da intenção.

## 3. Sistema de créditos (estilo Manus)

- **Créditos mensais** — do plano, resetam no ciclo de cobrança.
- **Créditos diários renovados** — um **piso diário** que reseta todo dia (ex.: 100–300/dia).
  Mantém engajamento mesmo com o mensal esgotado; ótimo p/ trial/low tier a custo controlado.
- **Top-up** — pacotes avulsos quando acaba.
- **1 crédito** = unidade de consumo. `créditos = tokens × preço-do-modelo ÷ taxa` — a taxa
  embute a margem. O usuário **só vê créditos**; nunca US$.

Consumo ilustrativo (calibrar no piloto):
- Mensagem **Flash** (~15k tokens, modelo barato) ≈ **3–5 créditos**.
- Mensagem **Expert** (~30k tokens, Claude, alto raciocínio) ≈ **80–150 créditos**.
- Tarefa **Crew** (4 agentes × Expert) ≈ **400–800 créditos**.
- Imagem (nano-banana) ≈ **20–40 créditos** · Vídeo ≈ **200–1.000 créditos**.

## 4. Planos (ponto de partida — calibrar no piloto)

| Plano (UI) | Legacy doc | Preço R$/mês | ~US$ | Créditos/mês | Diários | Tiers UI | Imagem/Vídeo |
|---|---|---|---|---|---|---|---|
| **Hobby** | Essencial | 97 | 17,6 | 3.000 | 100/dia | Relay | 50 img |
| **Pro** | Pro | 247 | 44,9 | 10.000 | 200/dia | Relay + MAX | 200 img · vídeo básico |
| **Business** | Business | 597 | 108,5 | 30.000 | 300/dia | Relay + MAX + Agentes | 800 img · vídeo |
| **Trial** | Trial | 0 (14 dias) | 0 | — | 150/dia | Relay | 5 img |
| **Top-up** | R$29 | — | +1.500 | — | — | — | ~mesma |

> Benchmark Manus: $20 = 4.000/mês + 300/dia · $40 = 8.000 · $200 = 40.000 (~200 cr/US$).
> "Uso máx" = pior caso (tenant esgota o allowance); o **típico** (30–50%) tem margem bem maior —
> usuários leves subsidiam os pesados, e o teto rígido garante que nenhum vira prejuízo.

## 5. Arquitetura técnica

```
Stripe (assinatura de plano + compra de top-up)
   │  webhook: plano ativo / mudou / cancelou
   ▼
Provisioner Work4You  (a construir)
   │  cria/atualiza a chave OpenRouter do tenant
   │  LIMITE (US$) = allowance do plano ÷ margem  ← mapeamento plano→limite
   ▼
OpenRouter (conta Work4You com crédito)
   ├─ key-tenant-A (limite $X)   ← teto rígido físico
   ├─ key-tenant-B (limite $Y)
   └─ acesso a TODOS os modelos (texto / imagem / vídeo)
   ▲
Wayne do tenant usa SÓ a chave dele → todo consumo bate no limite
   │
Medição: lê uso da chave (API OpenRouter) → converte em CRÉDITOS → dashboard
   │  faixas 50/75/90% (avisos amigáveis, ver billing-usage-notices)
   │  100% → 402
   ▼
402 "acabaram os créditos" → upgrade (Stripe) OU top-up → sobe o limite da chave
```

**Peças a construir:** Provisioner (plano→limite de chave OpenRouter), conversor uso→créditos,
dashboard de créditos (mensal + diário + "ver utilização"), avisos (50/75/90/402), gating de
tier no menu, mapeamento tier→(modelo, esforço, agentes).

## 6. Anatomia de custo por tenant (mensal)

| Item | Custo | Nota |
|---|---|---|
| **Infra fly** (instância dedicada + `suspend` + volume 5GB) | **~US$5** | o piso — ver risco |
| **LLM (OpenRouter)** | = allowance do plano | a alavanca; teto rígido |
| **Imagem/vídeo** | por geração | nano-banana ~US$0,02–0,04/img; vídeo US$0,10–1+/clipe |
| **Stripe (Brasil)** | ~5% + R$0,39 | |

## 7. Riscos & mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **Piso de infra (~US$5/tenant dedicado)** | Free/low tier **sangram** (1.000 free = US$5k/mês) | Free = **trial 14 dias / CAC ~$5**; `suspend` agressivo; entrada ≥ ~R$97; **infra compartilhada** p/ tiers baixos se pesar (decisão futura) |
| **Blowup agêntico** (loops consomem tokens) | Custo dispara | **Teto rígido da chave** + Auto/Flash padrão + limite de passos por turno |
| **Preço de LLM / câmbio muda** | Margem encolhe | Allowance em **US$** (não tokens fixos); revisar câmbio dos planos por trimestre |
| **Abuso** (revenda, bots) | Custo/risco | 1 chave/tenant + rate-limit + termos |

## 8. Features de UX / upsell

- **Auto como padrão** (sem fricção + margem).
- **Gating no menu** com cadeado + "Fazer upgrade" (estilo SuperGrok).
- **Sugestão no meio da conversa** (a construir, fase 2): quando o Wayne detecta tarefa difícil
  ou "patina" no Flash, sugere — *"Isso pede mais capacidade. Quer que eu use o **Expert**?
  (consome mais créditos)"*. UX + upsell + margem juntos. **Não é nativo** — feature nova.

## 9. Roadmap de construção (billing)

> **Sequência detalhada:** `docs/AUDITORIA-PRODUTO-WORK4YOU.md` — Fase 10, Onda D (D2–D6).

1. **Fundação:** Stripe (planos + webhooks) · Provisioner (plano→chave OpenRouter com limite).
2. **Tiers UI v2:** Relay/MAX → (modelo, esforço); menu com gating; migration Flash/Expert/Crew.
3. **Créditos:** conversor uso→créditos · dashboard (mensal + diário) · avisos 50/75/90/402.
4. **Imagem/vídeo:** ligar provedor na chave do tenant.
5. **Upsell fase 2:** sugestão MAX no meio da conversa · top-up.
6. **Piloto:** 10–20 tenants reais → calibrar créditos/preços.

## 10. Pendências para o piloto (calibração)

- Custo real de crédito por tier (tokens médios por mensagem/tarefa).
- Utilização média por perfil (p/ margem real vs. pior caso).
- Preço final dos planos e tamanho dos allowances.
- Piso de infra real por tenant com `suspend` (validar o ~US$5).
