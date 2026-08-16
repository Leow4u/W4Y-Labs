# OpenRouter (agregador) vs. integração directa por fornecedor

**Data da pesquisa:** 15 de Agosto de 2026
**Âmbito:** plataforma SaaS multi-tenant que revende inferência aos seus utilizadores finais.

Todas as afirmações abaixo têm link. Onde a fonte oficial não confirma, está escrito **NÃO CONFIRMADO** de forma explícita. Não há preços nem cláusulas inferidas.

---

## 0. Resumo executivo

| Eixo | OpenRouter | Directo |
|---|---|---|
| Custo adicional | 5,5% na compra de créditos (mín. $0,80); 5% no BYOK acima da franquia | 0% |
| Markup por token | Nenhum (pass-through confirmado na FAQ oficial) | — |
| Chaves por tenant com tecto em $ | Sim, API documentada para SaaS | Construir |
| Rate limit por tenant (RPM/TPM) | **Não** — capacidade é global à conta | Construir |
| Tectos de gasto impostos pelo fornecedor | Não | Sim: Anthropic $500–$200k/mês, Google $250–$100k/mês |
| ToS permite SaaS a clientes finais | Ambíguo (ver §4.1) | Sim nos quatro fornecedores, com condições |
| SLA | Só no plano Enterprise | Variável |

Os dois achados que mais mudam a decisão, e que provavelmente não estavam no radar:

1. **A cláusula 9.4 dos termos do OpenRouter proíbe aceder ao serviço "for purposes of reselling API access to Models"**, ao mesmo tempo que a secção 5.1 contempla explicitamente os teus clientes a usarem modelos através do teu produto. Isto é uma tensão real no contrato e merece uma conversa com o OpenRouter antes de escalar. Detalhe em §4.1.
2. **Ir directo não elimina tectos — introduz outros.** A Anthropic e a Google passaram, em 2026, a impor tectos de gasto mensais obrigatórios ao nível da organização/conta de faturação. Na Google, atingir o tecto **pausa todos os pedidos até ao ciclo seguinte**. Numa plataforma que revende, isso é um risco de indisponibilidade que hoje não tens. Detalhe em §3.

---

## 1. Custo do OpenRouter em 2026

### 1.1 Fees confirmados em fonte oficial

Fonte: [FAQ do OpenRouter](https://openrouter.ai/docs/faq) e [página de pricing](https://openrouter.ai/pricing), ambas consultadas a 15/08/2026.

| Item | Valor | Fonte |
|---|---|---|
| Compra de créditos (cartão / AliPay) | **5,5%**, mínimo $0,80 | FAQ, "What are the fees for using OpenRouter?" |
| Compra de créditos (cripto, USDC) | **5,0%** | FAQ, mesma secção |
| Markup por token | **Nenhum** | FAQ (ver citação abaixo) |
| BYOK — franquia Pay-as-you-go | **$25.000/mês** de inferência a preço de tabela, sem fee | FAQ + tabela de pricing |
| BYOK — franquia Enterprise | **$200.000/mês** de inferência a preço de tabela, sem fee | FAQ + tabela de pricing |
| BYOK — acima da franquia | **5%** do que o mesmo modelo e provider custariam no OpenRouter, deduzido dos créditos | FAQ |
| Descontos de volume | **Não existem** no PAYG | FAQ, "How do volume discounts work?" |
| Desconto por opt-in de logging | 1% sobre o custo de uso | FAQ, "What data is logged during API use?" |

Citação literal da FAQ sobre markup:

> "OpenRouter charges a 5.5% ($0.80 minimum) fee when you purchase credits. We pass through the pricing of the underlying model providers without any markup, so you pay the same rate as you would directly with the provider."

E, na secção "How does OpenRouter make money?":

> "We charge a small fee when purchasing credits. We never mark-up the pricing of the underlying providers, and you'll always pay the same as the provider's listed price."

**Resposta directa à tua pergunta:** os preços por token são iguais aos do fornecedor. Não há markup por token. O custo do OpenRouter é inteiramente a fee de 5,5% na entrada de dinheiro, mais eventualmente 5% em BYOK acima da franquia.

### 1.2 Correcção importante sobre o BYOK

Grande parte dos artigos de 2026 que aparecem em pesquisa (TrueFoundry, amnic, ofox, SolCard, e até um tutorial no próprio blog do OpenRouter) ainda descreve a franquia BYOK como **"primeiro 1 milhão de pedidos por mês grátis"**. Essa é a regra antiga, anunciada em Outubro de 2025.

A [FAQ oficial](https://openrouter.ai/docs/faq) hoje diz outra coisa, e é explícita quanto à mudança de unidade:

> "BYOK has a plan-dependent free allowance **measured by list-price inference cost, not request count**. Pay-as-you-go includes $25,000 per month with no BYOK fee, while Enterprise includes $200,000."

A [tabela de pricing](https://openrouter.ai/pricing) confirma: `$25,000 of list price inference / month with no fees, 5% fee after` no PAYG, e `$200,000` no Enterprise.

Isto é materialmente melhor para uma plataforma do que a regra por pedidos: uma app agêntica faz muitos pedidos pequenos, e a métrica por pedidos esgotava-se cedo. Com a métrica em dólares, só pagas os 5% de BYOK depois de $25k/mês de inferência a preço de tabela.

### 1.3 Outras condições financeiras

- **Créditos expiram**: a FAQ diz que se reservam o direito de expirar créditos não usados ao fim de um ano.
- **Reembolsos**: só até 24 horas após a compra; as fees da plataforma **não são reembolsáveis**; cripto nunca é reembolsável.
- **Limites por transacção**: mínimo $5. (O máximo de $25.000 por transacção aparece em fonte de terceiros — **NÃO CONFIRMADO** em documentação oficial.)
- **Enterprise**: a tabela indica "Fee discounts available" e "Volume commitments", mas **os valores concretos não são públicos — NÃO CONFIRMADO**.

### 1.4 Ordem de grandeza

Sobre $100.000/ano de inferência comprada em créditos com cartão, a fee do OpenRouter é ~$5.500/ano. Sobre $1M/ano, ~$55.000/ano. É esse o número a comparar com o custo de engenharia e de risco operacional das secções seguintes — não com zero.

---

## 2. Provisioning keys e limites no OpenRouter

### 2.1 A API existe, mudou de nome

A antiga "Provisioning API Keys" chama-se hoje **Management API Keys**. O URL antigo `openrouter.ai/docs/features/provisioning-api-keys` continua a resolver e serve a mesma página que [`/docs/guides/overview/auth/management-api-keys`](https://openrouter.ai/docs/guides/overview/auth/management-api-keys).

A doc lista, como primeiro caso de uso:

> "**SaaS Applications**: Automatically create unique API keys for each customer instance"

Ou seja, o OpenRouter documenta explicitamente o padrão multi-tenant que precisas.

### 2.2 O que a API permite

Endpoints em `/api/v1/keys`, autenticados com uma Management API key (que **não** pode fazer chamadas de inferência — é só administrativa):

| Operação | Método | Notas |
|---|---|---|
| Listar chaves | `GET /api/v1/keys` | 100 por página, paginação por `offset` |
| Criar chave | `POST /api/v1/keys` | campos `name`, `limit` (tecto em créditos) |
| Ler chave | `GET /api/v1/keys/{hash}` | |
| Actualizar | `PATCH /api/v1/keys/{hash}` | `disabled`, `limit`, `limit_reset`, `include_byok_in_limit` |
| Apagar | `DELETE /api/v1/keys/{hash}` | |

O objecto devolvido cobre exactamente as três coisas que perguntaste — tecto em dólares, consulta de gasto e revogação:

```json
{
  "hash": "...", "name": "Customer Key", "disabled": false,
  "limit": 10, "limit_remaining": 10, "limit_reset": null,
  "include_byok_in_limit": false,
  "usage": 0, "usage_daily": 0, "usage_weekly": 0, "usage_monthly": 0,
  "byok_usage": 0, "byok_usage_daily": 0, "byok_usage_weekly": 0, "byok_usage_monthly": 0
}
```

- **Tecto em dólares por utilizador**: `limit`, com `limit_reset` opcional em `daily` / `weekly` / `monthly` (reset à meia-noite UTC).
- **Consultar gasto**: `usage` acumulado e janelas diária/semanal/mensal, separando uso normal de uso BYOK.
- **Revogar**: `disabled: true` (reversível) ou `DELETE` (definitivo).
- A própria chave do tenant pode consultar o seu estado em [`GET /api/v1/key`](https://openrouter.ai/docs/api-reference/limits).

### 2.3 Limites de quantidade de chaves

**NÃO CONFIRMADO.** Não encontrei limite documentado ao número de chaves criáveis via Management API. A doc só menciona paginação de 100 em 100 na listagem, o que sugere que se espera volume, mas não é uma garantia.

### 2.4 A limitação que importa para multi-tenant

Esta é a parte que a documentação de marketing não destaca. Da [página de Limits](https://openrouter.ai/docs/api-reference/limits), primeira frase:

> "Making additional accounts or API keys will not affect your rate limits, **as we govern capacity globally**."

Consequência prática: consegues dar a cada tenant um **tecto em dólares**, mas **não** consegues dar-lhe um tecto em RPM/TPM. Todos os tenants partilham a capacidade da conta. Um tenant com um loop agêntico descontrolado consome capacidade que é dos outros, e a única defesa do OpenRouter é o tecto em dólares — que actua depois do dinheiro gasto, não antes da saturação.

Gateways self-hosted como o LiteLLM dão `rpm_limit` e `tpm_limit` por chave e por equipa (§6.2). Se o isolamento de ruído entre tenants for um requisito, esta é uma lacuna real do OpenRouter, independentemente de custo.

### 2.5 Segunda limitação: o regime de latência perto do limite

Da doc oficial [Latency and Performance](https://openrouter.ai/docs/guides/best-practices/latency-and-performance):

> "To maintain accurate billing and prevent overages, OpenRouter performs additional database checks when: a user's credit balance is low (single digit dollars); **an API key is approaching its configured credit limit**. OpenRouter expires caches more aggressively under these conditions to ensure proper billing, which increases latency until additional credits are added."

Isto é directamente relevante para o teu desenho: se dás a cada tenant uma chave com `limit`, os teus tenants passam a maior parte do ciclo a aproximar-se do limite. Ou seja, o regime degradado descrito na doc é o regime normal de operação de uma plataforma que usa limites por chave. Vale a pena medir isto antes de assumir que é irrelevante.

### 2.6 É adequado para multi-tenant?

Funcionalmente, sim: é a forma mais rápida de ter chaves por utilizador com tecto, contabilidade e revogação, sem construir metering. As reservas são: (a) sem isolamento de rate limit, (b) o comportamento de latência de §2.5, (c) a questão contratual de §4.1.

---

## 3. O que se perde (e o que se ganha) ao ir directo

### 3.1 Anthropic

Fonte: [platform.claude.com/docs/en/api/rate-limits](https://platform.claude.com/docs/en/api/rate-limits).

A Anthropic **abandonou o modelo de tiers por depósito** durante 2026. Os tiers agora são `Evaluation` → `Start` → `Build` → `Scale` → `Custom`, e a atribuição é automática:

> "Organizations are placed on a tier automatically based on usage history and account standing and can move to a higher tier over time as they use the API."
>
> "New organizations and organizations with limited usage history may start in the **Evaluation tier**, with limits below the standard limits shown on this page while account history is established."

Não há forma documentada de comprar um tier. Não podes chegar com $5.000 e ficar no Scale — tens de construir histórico ou falar com vendas.

**Tectos de gasto mensais obrigatórios:**

| Tier | Tecto mensal |
|---|---|
| Start | $500 |
| Build | $1.000 |
| Scale | $200.000 |
| Custom | Sem tecto, negociado |

> "Once you reach your tier's spend cap, API usage pauses until the next month unless you request a higher limit."

**Rate limits (Opus 5 / Sonnet 5, por organização):**

| Tier | RPM | ITPM | OTPM |
|---|---|---|---|
| Start | 1.000 | 2.000.000 | 400.000 |
| Build | 5.000 | 5.000.000 | 1.000.000 |
| Scale | 10.000 | 10.000.000 | 2.000.000 |

Dois detalhes que jogam a favor do directo:

- **Cache reads não contam para ITPM** na generalidade dos modelos actuais (excepção: Haiku 3.5), e são facturados a 10% do preço de input. Isto multiplica o throughput efectivo em cargas agênticas com prefixo estável.
- **`max_tokens` não conta para OTPM** — é medido em tempo real sobre tokens realmente gerados.

**Priority Tier:** deixou de ser vendável. Da [doc de service tiers](https://platform.claude.com/docs/en/api/service-tiers): "Priority Tier capacity commitments are no longer available for purchase." Só continua para quem já tem contrato. Alvo de 99,5% de uptime.

### 3.2 OpenAI

Fonte: [platform.openai.com/docs/guides/rate-limits](https://platform.openai.com/docs/guides/rate-limits).

| Tier | Qualificação | Limite de uso |
|---|---|---|
| Free | Geografia permitida | $100/mês |
| Tier 1 | $5 pagos | $100/mês |
| Tier 2 | $50 pagos | $500/mês |
| Tier 3 | $100 pagos | $1.000/mês |
| Tier 4 | $250 pagos | $5.000/mês |
| Tier 5 | $1.000 pagos | $200.000/mês |

A tabela oficial hoje lista **apenas o valor pago** como qualificação. Os requisitos de espera ("7 dias", "14 dias", "30 dias desde o primeiro pagamento") aparecem em fóruns da comunidade e blogs de terceiros — **NÃO CONFIRMADO na página oficial actual**.

Notas relevantes da mesma página:
- Rate limits definidos ao nível de **organização e de projecto**, não de utilizador — logo, não servem para isolar tenants sem trabalho extra.
- Modelos de contexto longo (GPT-5.5) têm rate limit separado para pedidos long-context.
- Existem "shared limits" entre famílias de modelos: várias entradas podem partilhar o mesmo bucket de TPM.
- A própria doc recomenda o padrão que estás a construir: "set a usage limit for individual users within a specified time frame (daily, weekly, or monthly). Consider implementing a hard cap or a manual review process for users who exceed the limit."

### 3.3 Google (Gemini API / AI Studio)

Fontes: [ai.google.dev/gemini-api/docs/billing](https://ai.google.dev/gemini-api/docs/billing) e [/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits).

Este é o fornecedor mais restritivo para o teu caso de uso.

| Tier | Qualificação | Tecto mensal de gasto |
|---|---|---|
| Free | Projecto activo ou trial | N/A |
| Tier 1 | Ligar conta de faturação activa | **$250** |
| Tier 2 | $100 pagos + 3 dias desde o primeiro pagamento | **$2.000** |
| Tier 3 | $1.000 pagos + 30 dias desde o primeiro pagamento | **$20.000 – $100.000+** |

Além disso há **spend rate limits** numa janela deslizante de 10 minutos: $10 no Tier 1, $200 nos Tiers 2 e 3.

Os pontos operacionalmente perigosos, todos citados da doc oficial:

- "Tiers, rate limits, and billing account caps are all determined at the **billing account level**." Todos os projectos ligados herdam o tier.
- "The cumulative usage from all keys within a project counts toward that project's spend cap and the billing account's total spend." Não há isolamento por chave.
- O gasto que qualifica é o gasto cumulativo em **todos os produtos Google Cloud**, não só Gemini.
- Os spend caps **não estão disponíveis para contas com faturação por invoice**.
- Nota da doc: contas abertas depois de **2 de Março de 2026** não podem usar os $300 de crédito de boas-vindas para pagar Gemini API / AI Studio.
- Tarefas longas (batch, sessões de agente) "may incur overages beyond your project spend cap", e o processamento de dados de faturação tem até ~10 minutos de atraso — logo há overage estrutural na fronteira do tecto.

Há ainda uma mudança operacional relevante: segundo o [fórum oficial Google AI Developers](https://discuss.ai.google.dev/t/gemma-api-important-question-tos-does-this-violate-the-rules/137896), a partir de **19 de Junho de 2026** a Gemini API deixa de aceitar pedidos de chaves não restritas. (Fonte é um post de fórum de staff, não documentação — trate-se como indicação forte, não como doc normativa.)

Para produção séria com clientes finais, o caminho da Google é o **Vertex AI**, que tem SLA, VPC Service Controls, e [Provisioned Throughput](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput) — subscrição de custo e prazo fixos, comprada em GSUs, com termos desde 1 semana, não cancelável a meio, e overage facturado em pay-as-you-go.

### 3.4 xAI (agora SpaceXAI)

Fonte: [docs.x.ai/developers/rate-limits](https://docs.x.ai/developers/rate-limits).

| Tier | Gasto cumulativo desde 1 Jan 2026 |
|---|---|
| Tier 0 | $0 (por omissão) |
| Tier 1 | $50 |
| Tier 2 | $250 |
| Tier 3 | $1.000 |
| Tier 4 | $5.000 |
| Enterprise | A pedido |

> "Once you qualify for a tier, you stay there permanently; tiers never downgrade."

Limites em RPS e TPM por modelo. Em `grok-4.5`: Tier 0 já dá 150 RPS e 50M TPM, escalando até 500 RPS / 100M TPM no Tier 4. É, de longe, o fornecedor mais permissivo à entrada, e **o único dos quatro sem tecto de gasto mensal obrigatório**.

### 3.5 Síntese dos requisitos de acesso

| Fornecedor | Mínimo de gasto | Aprovação humana | Histórico exigido | Tecto de gasto imposto |
|---|---|---|---|---|
| Anthropic | Nenhum | Só acima do Scale | **Sim** (atribuição automática por histórico) | **Sim**, $500 → $200k |
| OpenAI | $5 para o Tier 1 | Só acima do Tier 5 | Cumulativo pago | Sim, $100 → $200k |
| Google | Ligar billing | Só para Tier 3 por vendas | Gasto cumulativo GCP + idade da conta | **Sim**, $250 → $100k |
| xAI | Nenhum | Só Enterprise | Gasto cumulativo, nunca desce | **Não** |

---

## 4. Restrições contratuais sobre revenda — a parte crítica

Aviso: isto é leitura de termos publicados, não aconselhamento jurídico. Para uma decisão vinculativa, valide com advogado.

### 4.1 OpenRouter — há uma tensão interna nos termos

Fonte: [openrouter.ai/terms](https://openrouter.ai/terms).

A **secção 5.1** contempla explicitamente o teu modelo de negócio:

> "You acknowledge that the Service enables you, your Authorized Users, and **your customers (to the extent you incorporate the Service into your own products and services)** access to Models provided by Model Providers."

A **secção 5.2** estabelece o flow-down: tens de garantir que os teus clientes cumprem os Model Terms, e és responsável por eles.

Mas a **secção 9**, na lista de condutas proibidas, item 4, diz:

> "access the Site or Service for purposes of **reselling API access to Models** or otherwise developing a competing service"

A leitura mais natural é que a 9.4 visa a revenda pura de acesso (ser um proxy que vende chaves) e a 5.1 cobre o produto com valor acrescentado. Mas os termos não definem a fronteira, e uma plataforma que dá a cada tenant a sua própria chave OpenRouter com um tecto em dólares fica desconfortavelmente perto da descrição literal da 9.4.

**Recomendação concreta:** antes de escalar, obter confirmação escrita do OpenRouter (via `support@openrouter.ai` ou o canal Enterprise) de que a arquitectura de chave-por-tenant não cai na 9.4. É um email, e remove o único risco existencial desta escolha.

Outras obrigações relevantes dos mesmos termos:
- **5.5**: o OpenRouter pode suspender o teu acesso — e o dos teus clientes — se acreditar que houve violação de Model Terms, ou se um Model Provider o exigir. Cabe-te a ti resolver com o fornecedor.
- **5.7**: modelos restritos (por entidade ou geografia) não podem ser acedidos, e tens de impedir que os teus clientes os acedam, incluindo via VPN. Violação é breach material com suspensão imediata.
- **5.9**: tens de fornecer certificações e informação que o OpenRouter peça para provar conformidade.

### 4.2 Anthropic — permite SaaS de forma explícita

Fonte: [anthropic.com/legal/commercial-terms](https://www.anthropic.com/legal/commercial-terms).

Cláusula A.1, primeira linha do contrato:

> "Anthropic gives Customer permission to use the Services, **including to power products and services Customer makes available to its own customers and end users ("Users")**."

Isto é uma autorização directa e sem ambiguidade para o modelo SaaS. A restrição está em D.4:

> "Customer may not and must not attempt to (a) access the Services to build a competing product or service, including to train competing AI models **or resell the Services except as expressly approved by Anthropic**; (b) reverse engineer or duplicate the Services; or (c) support any third party's attempt at any of the conduct restricted in this sentence."

Lida em conjunto com A.1: construir um produto sobre a API e vendê-lo é permitido; revender o serviço em si não é.

**Nota sobre desinformação em circulação:** há artigos de 2026 (por exemplo o [SitePoint, "The End of the 'Wrapper' Era?"](https://www.sitepoint.com/end-wrapper-era-anthropic-api-terms-saas/)) que afirmam que a Anthropic mudou os termos para proibir SaaS que autentica pedidos em nome de utilizadores terceiros. **O texto oficial dos Commercial Terms não suporta essa leitura** — A.1 diz o contrário. A restrição real sobre uso de credenciais em nome de terceiros aplica-se a subscrições de consumidor (Claude Pro/Max), não à API comercial.

**Obrigações que herdas:**
- **D.2**: tu e os teus Users só podem usar os serviços em conformidade com a [Usage Policy](https://www.anthropic.com/legal/aup), a Supported Regions Policy e os Service Specific Terms, todos incorporados por referência.
- **D.3**: tens de notificar os teus Users de que as afirmações factuais nos outputs podem ser falsas ou incompletas.
- **C**: o [DPA](https://www.anthropic.com/legal/commercial-terms) aplica-se por incorporação — relevante para RGPD, a Anthropic é subprocessador.
- **K.2**: indemnizas a Anthropic por reclamações relacionadas com inputs ou uso dos teus Users em violação da Usage Policy.
- **I.3.a**: a Anthropic pode suspender-te se **qualquer User** violar D.1, D.2 ou D.4.

Da [Usage Policy](https://www.anthropic.com/legal/aup), obrigações concretas sobre os teus utilizadores finais:
- **Disclosure**: qualquer chatbot ou agente interactivo virado ao cliente tem de revelar ao utilizador, pelo menos no início de cada sessão, que está a interagir com um sistema de IA e não com uma pessoa.
- **Human-in-the-loop**: em domínios de alto risco (aconselhamento, recomendações ou decisões subjectivas que afectem directamente indivíduos), um profissional qualificado tem de rever o conteúdo antes de chegar ao consumidor.
- **Uso agêntico**: pedir só as permissões necessárias, minimizar armazenamento de informação sensível, preferir acções reversíveis, e confirmar com o utilizador em caso de dúvida sobre o âmbito.

### 4.3 OpenAI — permite SaaS, proíbe revender a conta

Fonte: [OpenAI Services Agreement](https://openai.com/policies/services-agreement/), **efectivo a 1 de Janeiro de 2026**.

Cláusula 2.2:

> "OpenAI grants Customer a non-exclusive right to access and use the Services during the Term. This includes the right to use OpenAI's API **to integrate the Services into Customer Applications and to make Customer Applications available to End Users**."

Cláusula 3.1:

> "Customer may not **resell or lease access to its Account or any End User Account**."

A fronteira é limpa: vender um produto que usa a API é permitido; vender acesso à conta não é.

Cláusula 3.2 — a obrigação que herdas:

> "Customer is responsible for all activities that occur under its Account, including the activities of End Users with an End User Account **or who access the Services through a Customer Application**. Customer will obtain and maintain from End Users any consents necessary..."

Cláusula 3.3, restrições que tens de fazer cumprir aos End Users, com destaque para uma que afecta desenhos BYOK:

> "(g) buy, sell, or transfer API keys from, to, or with a third party"

Se alguma vez pensares em pedir aos tenants que colem a sua própria chave OpenAI, este ponto merece leitura atenta.

Cláusula 13.2: indemnizas a OpenAI por reclamações relacionadas com as tuas Customer Applications.

### 4.4 Google

**A Gemini API não tem, que eu tenha encontrado, uma proibição geral de revenda de inferência.** Os [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) contêm uma cláusula de "resell", mas ela é **específica dos resultados do Grounding with Google Search**:

> "You will not, and will not allow your end user or any third party to, cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded Results or Search Suggestions."

**NÃO CONFIRMADO:** que exista proibição geral de revenda de inferência Gemini nos Additional Terms. O que é claro é que o uso é governado cumulativamente pelos Google APIs Terms of Service, os Additional Terms e a [Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy), e que revender acesso ao **free tier** é explicitamente indicado como violação (fonte: fórum oficial, ver §3.3).

Para revenda a clientes finais com base contratual sólida, o caminho é o **Vertex AI** sob os Google Cloud Platform Terms, cujas [Service Specific Terms](https://cloud.google.com/terms/service-terms) têm secções dedicadas a Resold Customers (§14) e a Generative AI Services (§20), incluindo a incorporação da Prohibited Use Policy na AUP e o direito de suspensão imediata por suspeita de violação.

Nota adicional relevante: os [Additional Terms for Generative AI Preview Products](https://cloud.google.com/trustedtester/aitos) proíbem usar produtos Pre-GA para fins comerciais ou de produção, e proíbem divulgar output a terceiros. Se rotares modelos novos assim que saem, verifica o estado GA antes de os expor a clientes.

### 4.5 xAI / SpaceXAI — o modelo mais explícito dos quatro

Fonte: [x.ai/legal/terms-of-service-enterprise](https://x.ai/legal/terms-of-service-enterprise).

A xAI tem um conceito contratual desenhado precisamente para o teu caso, o **"Bundled Service"**:

> "SpaceXAI grants Customer the limited, non-transferable, non-sublicensable right to ... (b) use SpaceXAI's application programming interfaces ("APIs") to develop integrations between the Services and Customer's own products or services (each, a "**Bundled Service**"); and (c) **distribute or otherwise make the Bundled Service available to Customer's end users ("End Users")**. ... provided however that **Customer may only provide End Users with access to the Services as part of a Bundled Service**. No direct contractual relationship is created between SpaceXAI and any End User, and Customer remains fully responsible and liable for all acts and omissions of its End Users."

A condição explícita — só como parte de um Bundled Service — é o teste de "valor acrescentado" escrito no contrato. Um proxy nu não passa.

Obrigação de flow-down, na mesma secção:

> "Customer represents, warrants, and covenants that it **has and will maintain legally enforceable terms of service and an acceptable use policy with all Permitted Users and End Users that are no less protective of SpaceXAI and the Services than this Agreement and the AUP**."

Ou seja: tens de ter ToS e AUP próprios, com os teus utilizadores, pelo menos tão protectores quanto os da xAI. Isto é uma obrigação accionável, não uma formalidade.

A [AUP](https://x.ai/legal/acceptable-use-policy) (efectiva a **14 de Agosto de 2026**, ontem) proíbe "Modifying, copying, translating, leasing, selling, **reselling**, distributing, distilling... our Service" e "Scraping, harvesting or **reselling any Input or Output**".

Privacidade: o [DPA](https://x.ai/legal/data-processing-addendum) aplica-se automaticamente quando submetes dados pessoais, e a xAI actua como processador. Há uma API com Zero Data Retention, e se optares por ZDR tens de garantir que **todos** os dados pessoais passam por ela — falhar isso é breach material.

### 4.6 Síntese das obrigações sobre utilizadores finais

Os quatro fornecedores permitem SaaS. Os quatro exigem essencialmente o mesmo de ti:

| Obrigação | Anthropic | OpenAI | Google | xAI |
|---|---|---|---|---|
| Responsável pelos actos dos End Users | Sim (I.3.a, K.2) | Sim (3.2) | Sim | Sim (explícito) |
| Flow-down das políticas de uso | Sim (D.2) | Sim (3.3) | Sim | **Sim, com ToS/AUP próprios exigidos** |
| DPA / subprocessador | Sim (C) | Sim (5.3) | Sim | Sim |
| Indemnização ao fornecedor | Sim (K.2) | Sim (13.2) | Sim | Sim |
| Disclosure de IA ao utilizador final | **Sim, obrigatória** | Via Usage Policies | Via Prohibited Use Policy | Via AUP |
| Suspensão por violação de um só utilizador | Sim | Sim | Sim | Sim |

**Nota RGPD:** em qualquer dos cenários, o fornecedor é subprocessador. Se ires directo a quatro fornecedores, tens quatro DPAs e quatro subprocessadores a declarar aos teus clientes. Via OpenRouter, o OpenRouter é subprocessador e os fornecedores são subprocessadores de segundo nível — o que simplifica a lista mas não elimina o dever de divulgação.

---

## 5. Diferenças funcionais

### 5.1 Prompt caching

O OpenRouter suporta caching e resolve o problema difícil de um agregador — manter a cache quente — com **provider sticky routing** ([doc](https://openrouter.ai/docs/features/prompt-caching)):

- Após um pedido com caching, os pedidos seguintes para o mesmo modelo vão para o mesmo provider.
- Sessão expira ao fim de **10 minutos** de inactividade; cada pedido bem-sucedido reinicia o contador.
- Chave de sessão via `session_id` no corpo, header `x-session-id`, ou fallback para `prompt_cache_key` no estilo OpenAI.
- Só activa quando o preço de cache read é inferior ao preço normal de input.
- **Desliga-se se especificares `provider.order` manualmente** — a tua ordem explícita tem prioridade.

Facturação de cache, por fornecedor, conforme a doc do OpenRouter:

| Fornecedor | Cache write | Cache read |
|---|---|---|
| Anthropic (TTL 5 min) | 1,25x input | 0,1x input |
| Anthropic (TTL 1 h) | 2x input | 0,1x input |
| OpenAI (antes de GPT-5.6) | Sem custo | 0,25x ou 0,5x |
| OpenAI (GPT-5.6+) | 1,25x input | 0,25x ou 0,5x |
| Grok | Sem custo | 0,25x |
| Groq | Sem custo | 0,5x |
| Alibaba (explícito) | 1,25x | 0,1x |

Detalhes que diferem do directo:
- Mínimos de cache Anthropic: 4.096 tokens em Opus 4.5–4.8 e Haiku 4.5; 2.048 em Haiku 3.5.
- Máximo de 4 breakpoints explícitos; existe também caching automático com `cache_control` no topo do pedido, que avança o breakpoint sozinho conforme a conversa cresce.
- Marcadores são interoperáveis entre formatos (`cache_control` ↔ `prompt_cache_breakpoint`), **mas os TTL não são traduzidos**: um `ttl` de `cache_control` é descartado ao encaminhar para a OpenAI.
- O campo `cache_discount` na resposta reporta a poupança; na Anthropic é negativo nos writes e positivo nos reads.

**A diferença de facturação que só existe no directo:** na Anthropic directa, `cache_read_input_tokens` **não conta para o teu limite de ITPM** (§3.1). Isso não é um desconto de preço, é capacidade — e no OpenRouter não tens ITPM próprio para beneficiar, porque a capacidade é global à conta (§2.4).

### 5.2 Batch API

O OpenRouter **tem** Batch API, em beta ([quickstart](https://openrouter.ai/docs/batch-quickstart)):

- `POST /api/beta/batches` e `GET /api/beta/batches/{id}`, com polling; resultados devolvidos inline.
- Facturação tipicamente a **50% do preço normal por token**, espelhando os descontos de batch da OpenAI e da Anthropic.
- O campo `endpoint` escolhe o formato: `/v1/chat/completions`, `/v1/responses` ou `/v1/messages`.
- Inputs e resultados retidos **30 dias**.
- Modelos expostos com sufixo `:batch` (ex.: `openai/gpt-5:batch`).

Caveats documentados:
- Componentes que não são tokens **não são descontados uniformemente** — pesquisa web fica a preço normal, e as taxas de caching variam por modelo.
- Em batch da Anthropic, os pedidos podem ser processados concorrentemente e por qualquer ordem, pelo que uma cache escrita por uma linha **não é garantidamente visível** para outras linhas do mesmo batch. A recomendação da doc é usar `ttl: "1h"` num prefixo partilhado e reutilizá-lo entre batches sucessivos.
- O Batch API **não agrupa gerações por `session_id`**.
- Em BYOK, `usage.cost` reporta só a fee BYOK do OpenRouter, porque o fornecedor factura-te directamente.

### 5.3 Extended thinking / reasoning effort

Bem suportado ([doc](https://openrouter.ai/docs/use-cases/reasoning-tokens)):

- `reasoning.effort`: `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none` (estilo OpenAI).
- `reasoning.max_tokens`: orçamento de tokens (estilo Anthropic); mapeia para `thinking_budget` nos Qwen.
- Conversão automática entre os dois quando o modelo só suporta um.
- Metadados por modelo: `supported_efforts`, `default_effort`, `default_enabled`, `supports_max_tokens`, `mandatory`.
- **`reasoning_details`** preserva blocos de raciocínio encriptados ou sumarizados — necessário para tool calling multi-turno com Claude, onde os blocos de thinking têm de voltar intactos.

### 5.4 Formato nativo Anthropic ("Anthropic Skin")

O OpenRouter expõe um endpoint compatível com a Anthropic Messages API. Aponta-se `ANTHROPIC_BASE_URL` para `https://openrouter.ai/api` e o Claude Code fala o protocolo nativo directamente, sem proxy local ([doc](https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration)). Thinking blocks, tool use nativo, streaming e contexto multi-turno passam intactos.

Ressalvas da própria doc: a integração **só é garantida com o provider Anthropic first-party**; recomendam fixar Anthropic 1P como provider prioritário. O **fast mode** da Anthropic (até 2,5x mais rápido, preço premium, só em Opus 4.6/4.7/4.8 e Opus 5) é servido **exclusivamente** pelo Anthropic 1P — Bedrock e Vertex não o servem.

### 5.5 Ficheiros e PDFs

A [FAQ](https://openrouter.ai/docs/faq) diz:

> "The API supports text, images, and PDFs. ... PDFs can also be sent as URLs or base64 encoded data, and **work with any model on OpenRouter**."

Ou seja, o OpenRouter normaliza PDFs mesmo para modelos sem suporte nativo. Isto é uma vantagem do agregador sobre o directo, não uma perda.

### 5.6 Contagem de tokens

A Anthropic tem [`POST /v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting): gratuito, aceita a mesma estrutura de inputs (system prompts, tools, imagens, PDFs), com limites de RPM por tier. A doc da Anthropic é enfática: `tiktoken` subestima tokens Claude em ~15–20% em texto típico e muito mais em código.

**NÃO CONFIRMADO / provável lacuna:** não encontrei endpoint equivalente documentado no OpenRouter. Se o teu produto estima custo antes de enviar, ou faz gestão de janela de contexto do lado do cliente, isto é uma perda real ao usar o agregador.

### 5.7 Computer use

**NÃO CONFIRMADO.** Não encontrei documentação oficial do OpenRouter a confirmar (ou negar) suporte às ferramentas de computer use da Anthropic, que dependem de headers beta específicos. A doc do Claude Code diz que features avançadas passam "untouched" pelo Anthropic Skin, o que é encorajador mas não é uma confirmação de computer use. Requer teste empírico antes de depender disto.

### 5.8 Capacidade provisionada e compromissos com desconto

| Fornecedor | Estado em Agosto de 2026 |
|---|---|
| Anthropic | Priority Tier **já não é vendável**; só contratos existentes |
| Google Vertex | [Provisioned Throughput](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput) activo: GSUs, termos de 1 semana a anual, não cancelável, overage em PAYG, integra com explicit caching por burndown reduzido |
| OpenAI | Service Credits pré-pagos (cláusula 6.5 do Services Agreement); condições de capacidade reservada não públicas |
| xAI | "Provisioned Throughput scaling" mencionado no tier Enterprise; **valores NÃO CONFIRMADOS** |
| OpenRouter | Tabela de pricing indica "Volume commitments" no Enterprise; **valores NÃO CONFIRMADOS**; sem descontos de volume no PAYG |

**Este é o argumento económico mais forte para ir directo a prazo:** compromissos negociados e capacidade provisionada só existem na relação directa. O OpenRouter, por construção, passa o preço de tabela — e o preço de tabela é o pior preço que uma plataforma com volume consegue.

---

## 6. Fiabilidade, latência e alternativas

### 6.1 OpenRouter

**Latência.** A [doc oficial](https://openrouter.ai/docs/guides/best-practices/latency-and-performance) descreve a arquitectura (Cloudflare Workers no edge, cache de dados de utilizador e chave no edge, routing optimizado) e nota que caches frias — tipicamente nos primeiros 1–2 minutos numa região nova — dão latência mais alta.

Os números "~25ms na homepage" e "~40ms em condições típicas de produção" são citados por múltiplos artigos de terceiros a referenciar o OpenRouter. **NÃO CONFIRMADO**: não consegui extrair esses números do texto da doc oficial nas tentativas de recolha.

**Benchmark independente.** O melhor dado público que encontrei é da [Opper (2026)](https://opper.ai/blog/llm-router-latency-benchmark-2026): 200 chamadas a GPT-4.1 contra três destinos.

| Destino | Time to first token (IC 95%) | Tokens/segundo (IC 95%) |
|---|---|---|
| OpenAI directo | 0,712 s [0,687–0,735] | 81,8 [78,6–84,1] |
| OpenRouter | **0,640 s [0,609–0,657]** | 73,2 [71,3–76,3] |
| Opper | 0,744 s [0,725–0,796] | 81,5 [78,8–84,5] |

O OpenRouter foi **70ms mais rápido** que a OpenAI directa no primeiro token, com throughput ~10% inferior. Ambas as diferenças fora do ruído. Conclusão do estudo: não existe uma "taxa de router" universal — cada gateway tem o seu perfil, e há que medir o que se vai usar.

**Incidentes.** O OpenRouter publicou um [post-mortem oficial](https://openrouter.ai/blog/announcements/openrouter-outages-on-february-17-and-19-2026/) para duas falhas relacionadas:

- **17 de Fevereiro de 2026**, 38 minutos desde as 5:27 UTC. Uma dependência de caching de terceiros largou todas as ligações à base de dados. ~20% de falhas entre 5:27 e 5:40, subindo para 80–90% entre 5:40 e 6:05. Havia em paralelo um ataque de negação de serviço.
- **19 de Fevereiro de 2026**, 35 minutos desde as 7:36 UTC. Mesma camada de cache, mesmo padrão.

Detalhe operacionalmente relevante: durante as falhas, o serviço devolveu **401 "User not found"** em vez de 5xx, levando os programadores a depurar as suas próprias chaves. Segundo relatos de terceiros, isto foi corrigido e falhas de infraestrutura passaram a devolver 503.

A [status page](https://status.openrouter.ai/) mostra estado actual mas **não publica histórico de incidentes**. Não há SLA no plano Pay-as-you-go — "Contractual SLAs" aparece na tabela de pricing só na coluna Enterprise.

**Fallback.** Da FAQ: "If a provider returns an error OpenRouter will automatically fall back to the next provider. This happens transparently to the user." Complementado por variantes de routing (`:nitro` por throughput, `:floor` por preço, `:exacto` por fiabilidade de tool calling), array de modelos de fallback, e o sticky routing de §5.1.

### 6.2 É replicável por conta própria?

Sim, e o retry não é a parte difícil. A parte difícil é: (a) manter uma tabela de preços por modelo **e por provider** actualizada para metering correcto, (b) manter o catálogo de modelos a par dos lançamentos, (c) normalizar diferenças de formato entre fornecedores, (d) traduzir semântica de caching e reasoning entre APIs. Foi por isso que estas ferramentas existem:

| Gateway | Modelo | Metering / budgets por tenant | Custo | Notas |
|---|---|---|---|---|
| [LiteLLM](https://docs.litellm.ai/docs/proxy/users) | OSS, Python, self-host | Virtual keys; budgets pessoais, de equipa e de membro; `budget_duration` configurável; **`rpm_limit` e `tpm_limit` por chave e equipa** | Infra própria | O único da lista que resolve o rate limit por tenant que falta ao OpenRouter. Requer Postgres + Redis |
| Portkey | Core OSS + gerido | Virtual keys, budgets, relatórios por equipa | Plano gerido pago | Guardrails e redacção de PII incluídos; SOC 2 / HIPAA / GDPR |
| Bifrost (Maxim AI) | OSS Apache-2.0, Go | **Orçamentos hierárquicos em 4 níveis**: customer → team → virtual key → provider config, verificados em memória | Infra própria | Fornecedor publica ~11µs de overhead a 5.000 RPS (número do próprio) |
| [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/pricing) | Gerido | Analytics de custo e tokens; sem budgets hierárquicos | **Zero markup e zero platform fee, incluindo em BYOK no tier pago** | Sem self-host. Taxas de processamento de pagamento aplicam-se a compras de crédito; Enterprise pode facturar sem essas taxas |
| [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/reference/pricing/) | Gerido, edge | Analytics, cache, rate limiting; **sem budgets hierárquicos** | Core grátis; **Unified Billing tem 5% sobre créditos comprados**, sem markup por token | Sem self-host, sem controlo de residência de dados |

**A comparação comercial mais directa é o Vercel AI Gateway.** Oferece essencialmente a mesma proposta do OpenRouter — catálogo largo, uma chave, failover, BYOK — a **0%** em vez de 5,5%. Da doc oficial:

> "AI Gateway charges no markup and no platform fee on tokens. ... For the paid tier, AI Gateway provides tokens with zero markup, including when you bring your own key."

Se o objectivo for cortar a fee sem construir nada, isto merece ser avaliado antes de considerar integração directa. As contrapartidas: catálogo menor (200+ modelos / 40+ providers vs 500+ / 80+), sem budgets por tenant com a maturidade da Management API do OpenRouter, e uma dependência de plataforma nova.

---

## 7. Casos reais

### 7.1 Kilo Code — de maior app do OpenRouter a gateway próprio

O caso mais bem documentado, e o mais próximo do teu.

O Kilo Code é um agente de código open source, fork do Roo Code (que por sua vez é fork do Cline). Segundo o [perfil de research de Ry Walker](https://rywalker.com/research/kilo), tornou-se **a aplicação mais usada no OpenRouter**, com 3M+ utilizadores e 40T+ tokens processados, e levantou uma seed de $8M em Dezembro de 2025 (co-fundador Sid Sijbrandij, ex-CEO da GitLab).

Depois disso, **construiu o seu próprio gateway**. Da mesma fonte: "routing 500+ models through its own gateway at exact provider rates with zero markup" e "has since rebuilt around its own gateway and cloud-agent infrastructure".

O próprio blog do OpenRouter [reconhece a concorrência](https://openrouter.ai/blog/tutorials/kilo-code-openrouter/): "Kilo also offers Kilo Gateway, its own managed-billing path... Kilo markets it as zero-markup."

O que é instrutivo é **como monetizam**: não pela margem na inferência (que é zero), mas por subscrição — Kilo Pass a $19/$49/$199 por mês e Teams a $15 por utilizador/mês ([fonte](https://kilo.ai/articles/roo-to-kilo-migration-guide)). Desacoplaram a receita do custo de inferência.

E o número mais interessante, de uma [entrevista aos co-fundadores no ByteByteGo](https://blog.bytebytego.com/p/token-spend-out-of-control-the-case):

> "When the team let the Gateway route on its own instead of having users pick a model by hand, the **average cost per request dropped by about a third**. Kilo found that **80 to 90% of requests do not need frontier models**."

Ou seja: o maior ganho de custo não veio de eliminar a fee de 5,5% do agregador — veio de **routing inteligente entre modelos**, que reduziu o COGS em ~33%. Isso é uma ordem de grandeza acima da fee. Se estás a optimizar custo, esta é a alavanca a puxar primeiro, e é ortogonal à escolha agregador vs directo.

### 7.2 Roo Code e Cline

- **Roo Code** operou o "Roo Code Router" (curado, ao custo) e **arquivou o repositório a 15 de Maio de 2026**, pivotando para outro produto.
- **Cline** mantém acesso hospedado próprio, 200+ modelos via OpenRouter, e BYOK — modelo híbrido.

O padrão nos três: começar no OpenRouter pela distribuição e pelo catálogo, e internalizar o routing quando o volume torna a fee material **e** quando o routing passa a ser o produto, não a plumbing.

### 7.3 Ressalva honesta sobre esta secção

**Não encontrei um único post de engenharia de primeira mão, com números antes/depois, de uma empresa que migrou do OpenRouter para integração directa.** O que a pesquisa devolve em abundância é conteúdo SEO produzido por gateways concorrentes (TrueFoundry, Bifrost/Maxim, Ofox, OminiGate, ThinkNEO), cujo enviesamento é evidente e que trata a comparação como funil de aquisição.

Os limiares de break-even que esses artigos citam — tipicamente "$5.000–$10.000/mês de gasto" ou "quando a fee excede uma semana-engenheiro" — **não têm fonte primária verificável** e devem ser tratados como opinião de fornecedor interessado, não como dado.

---

## 8. Lista consolidada do que não foi possível confirmar

1. Limite máximo de chaves criáveis via Management API do OpenRouter.
2. Suporte do OpenRouter a computer use da Anthropic.
3. Endpoint de contagem de tokens no OpenRouter (equivalente a `count_tokens` da Anthropic).
4. Valores concretos dos "fee discounts" e "volume commitments" do OpenRouter Enterprise.
5. Os números "~25ms / ~40ms" de overhead na documentação oficial do OpenRouter (só obtidos via terceiros que a citam).
6. Requisitos de tempo de espera nos tiers da OpenAI (7/14/30 dias) — ausentes da página oficial actual.
7. Máximo de $25.000 por transacção de compra de créditos no OpenRouter.
8. Existência de proibição geral de revenda de inferência nos termos da Gemini API (só confirmei a proibição específica de Grounded Results).
9. Como o OpenRouter aplica na prática a cláusula 9.4 a plataformas SaaS.
10. Valores de provisioned throughput da xAI no tier Enterprise.

---

## 9. Leitura para a decisão

Nenhuma destas conclusões é uma recomendação de arquitectura — é o que os factos acima suportam.

**Contra ir directo já:**
- A fee de 5,5% é pequena face ao ~33% que o Kilo obteve só com routing entre modelos. Optimizar a escolha de modelo tem retorno maior e não exige mudar de fornecedor.
- Ir directo introduz tectos de gasto que hoje não tens: Anthropic pausa no tecto do tier, Google pausa **todos** os pedidos da conta de faturação até ao mês seguinte. Numa plataforma multi-tenant, isso é uma falha correlacionada em todos os tenants ao mesmo tempo.
- A Anthropic já não vende tiers. Chega-se ao Scale por histórico, o que significa que a rampa não é comprável.
- Os quatro fornecedores impõem obrigações de flow-down que continuam a existir de qualquer forma — ir directo multiplica DPAs e políticas a manter por quatro.

**A favor de reduzir a dependência:**
- Compromissos negociados e capacidade provisionada só existem na relação directa. Preço de tabela é o pior preço para quem tem volume.
- Sem isolamento de rate limit por tenant (§2.4), um tenant abusivo degrada os outros, e o tecto em dólares só actua depois do facto.
- O regime de latência degradada perto do limite de crédito por chave (§2.5) é precisamente o regime de operação normal de uma plataforma com limites por tenant.
- Sem SLA no PAYG, e com dois incidentes de 35–38 minutos documentados em Fevereiro de 2026.
- A tensão da cláusula 9.4 (§4.1) é um risco não quantificado sobre o modelo de negócio.

**Acções de baixo custo e alto retorno, independentemente da decisão:**
1. Obter confirmação escrita do OpenRouter sobre a cláusula 9.4 aplicada a chave-por-tenant.
2. Medir o efeito de latência de §2.5 no regime real de tenants perto do limite.
3. Avaliar o Vercel AI Gateway como comparação directa: mesma proposta, 0% em vez de 5,5%.
4. Investir em routing entre modelos antes de investir em mudar de fornecedor — é onde estão os 33%.
5. Manter a integração atrás de uma interface própria, para que a decisão continue reversível.
