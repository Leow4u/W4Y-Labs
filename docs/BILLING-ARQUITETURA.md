# Work4You — Arquitetura de Billing & Modelo de Negócio

> Referência oficial (2026-07-07). Fechado com o Leonardo. Números são **estimativas de
> planejamento** (preço de LLM, câmbio e consumo real só o piloto calibra); a **arquitetura,
> os tiers e a lógica de margem** estão decididos. Câmbio assumido ~R$5,5/US$.

## 1. Princípios (decididos)

1. **Créditos, nunca dólar.** O usuário vê "créditos" (estilo Manus). O custo financeiro real
   (OpenRouter/infra) fica escondido. Créditos escondem a volatilidade e embutem a margem.
2. **Teto rígido via chave OpenRouter por tenant.** Cada tenant usa uma chave OpenRouter
   **provisionada com limite de gasto**. É um teto físico em US$ — o tenant **não consegue**
   gastar além do plano. **Nunca perdemos dinheiro** além do allowance. É o pilar de proteção.
3. **Tiers próprios escondem as LLMs.** 4 "modelos Work4You" (Flash/Auto/Expert/Crew). Trocamos
   a LLM por trás quando quiser (preço/qualidade) sem o usuário perceber.
4. **Auto é o padrão.** Melhor UX (sem fricção) e melhor margem (roteia barato quando dá).
5. **Gating por plano = upsell.** Expert (Pro+) e Crew (Business) puxam upgrade.

## 2. Os 4 tiers (Flash · Auto · Expert · Crew)

Cada tier é um preset nativo de **modelo × esforço de raciocínio × nº de agentes** (tudo já
existe no Wayne: roteador OpenRouter, `reasoning_effort` low→xhigh, `delegate_task` multi-agente).

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

| Plano | Preço R$/mês | ~US$ | Créditos/mês | Diários | Tiers | Imagem/Vídeo | Margem bruta (uso máx) |
|---|---|---|---|---|---|---|---|
| **Trial** | 0 (14 dias, CAC ~$5) | 0 | — | 150/dia | Flash, Auto | 5 img | *CAC de aquisição* |
| **Essencial** | 97 | 17,6 | 3.000 | 100/dia | Flash, Auto | 50 img | **~49%** |
| **Pro** | 247 | 44,9 | 10.000 | 200/dia | + Expert | 200 img · vídeo básico | **~62%** |
| **Business** | 597 | 108,5 | 30.000 | 300/dia | + Crew | 800 img · vídeo | **~63%** |
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

1. **Fundação:** Stripe (planos + webhooks) · Provisioner (plano→chave OpenRouter com limite).
2. **Tiers:** mapear Flash/Auto/Expert/Crew → (modelo, esforço, agentes); menu com gating.
3. **Créditos:** conversor uso→créditos · dashboard (mensal + diário) · avisos 50/75/90/402.
4. **Imagem/vídeo:** ligar provedor (fal/openrouter, nano-banana) na chave do tenant.
5. **Upsell fase 2:** sugestão de tier no meio da conversa · top-up.
6. **Piloto:** 10–20 tenants reais → medir consumo por perfil → **calibrar créditos/preços**.

## 10. Pendências para o piloto (calibração)

- Custo real de crédito por tier (tokens médios por mensagem/tarefa).
- Utilização média por perfil (p/ margem real vs. pior caso).
- Preço final dos planos e tamanho dos allowances.
- Piso de infra real por tenant com `suspend` (validar o ~US$5).
