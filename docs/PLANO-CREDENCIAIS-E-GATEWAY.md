# Work4You — Plano credenciais, isolamento e gateway de modelos

> **Status:** plano de execução (ago/2026). Nasce da auditoria feita depois do PR #30.
> Produto: [`PRODUTO.md`](./PRODUTO.md) · Linguagem: [`LINGUAGEM.md`](./LINGUAGEM.md)
> Billing: [`BILLING-ARQUITETURA.md`](./BILLING-ARQUITETURA.md) · Superfícies: [`SECURITY-SURFACES.md`](./SECURITY-SURFACES.md)
> Pesquisa de fundo: PR #31 (agregador vs integração directa).

---

## Norte

Três invariantes. Tudo neste plano existe para as tornar verdadeiras no código, não só na intenção.

1. **A chave de um fornecedor nunca vive no cliente.** O que desce para a máquina do utilizador é uma credencial nossa, curta, renovável e revogável, que só vale contra o nosso gateway.
2. **O intermediário é interno e substituível.** O OpenRouter é estratégia nossa, não informação do utilizador. Trocá-lo — por modelo, gradualmente — por contratos directos com os laboratórios não pode exigir uma release do cliente. Mostrar o *laboratório* e o *modelo* é legítimo; mostrar o *broker* não.
3. **Isolamento entre tenants é físico onde é possível, e nunca só um identificador adivinhável.** Nenhum tenant consome limite de outro nem alcança as contas ligadas de outro.

**Escotilha que se mantém:** BYOK continua a existir e visível. Quem trouxer a própria chave passa a ter as garantias de retenção do seu fornecedor, e isso deve ser dito. Não se remove capacidade para simplificar.

---

## Linha de partida (o que já existe)

Metade do trabalho difícil já está escrita. O plano re-aponta e endurece; inventa pouco.

| Peça | Onde | Estado |
|---|---|---|
| Padrão "login na plataforma → token curto → gateway" | `work4you_cli/auth.py` (provider `nous`): device flow RFC 8628, JWT com scope `inference:invoke`, refresh 120 s antes de expirar, rotação de refresh token, keepalive, allowlist de host, entitlements nas claims + `/api/oauth/account` | **Completo, apontado à Nous** |
| Projeto Composio dedicado por tenant | `platform/provisioner/server.js` (`ensureComposioProject`, opção A; `COMPOSIO_ORG_KEY` só no control-plane) | **Escrito, chaveado por app Fly** |
| Tradução do broker para nome de produto | `work4you_cli/providers.py` (`"openrouter" → "Model catalog"`), `models.py` (`"Work4You models"`), testes em `test_product_provider_labels.py` | **Activo nas superfícies curadas** |
| Distinção plataforma vs BYOK | `W4Y_PLATFORM_MANAGED_ENV`, flag `platform_managed`, `provider-key-groups.ts` | **Activo** |
| `api_key` como função (token lazy por pedido) | precedente Azure Entra em `run_agent.py` | **Ponto de extensão pronto** |
| Scope de tenant deny-by-default no motor partilhado | `platform_tenant.py` + `test_platform_tenant.py` | **PR #30** |
| Chave Composio lida sem poluir `os.environ` | `_connector_env_value()` em `web_server.py` | **PR #30** |
| Proxy LiteLLM | `platform/model-proxy/` | **Parqueado** (flip revertido no dia; tráfego vai directo) |

---

## Ondas

Ordem por retorno sobre risco: primeiro o que fecha exposição e é contido, depois o que impede regressão, depois o estrutural.

### Onda S — fechar a auditoria (contido, sem arquitectura nova)

| ID | Trabalho | Ficheiros | Verificação |
|---|---|---|---|
| **S1** | `POST /api/env/reveal` recusa as chaves da plataforma. Hoje exige token de sessão e limita a taxa, mas não exclui `W4Y_PLATFORM_MANAGED_ENV`: a UI esconde a linha e a API entrega o valor a quem souber o nome. | `work4you_cli/web_server.py` (`~6720-6739`) | Teste: reveal de `OPENROUTER_API_KEY` e `COMPOSIO_API_KEY` responde 403; reveal de chave BYOK continua a funcionar. |
| **S2** | Verificar posse antes de desconectar. `DELETE /api/connectors/accounts/{id}` valida só o formato do id e apaga na Composio. Num projeto partilhado, um tenant autenticado que conheça um id de outro revoga o Gmail dele — pela nossa própria API, sem extrair chave nenhuma. Mesmo tratamento para triggers. | `work4you_cli/web_server.py` (`~2669-2679` e rotas de trigger) | Teste: conta de outro `user_id` devolve 404/403 e não chama a Composio; conta própria continua a desconectar. |
| **S3** | Login no desktop deixa de rodar a chave do projeto do tenant. O caminho pretendido (chave adicional por dispositivo) responde 404 sob org-key — está documentado no código — e o fallback regenera a chave do projeto e reinjecta-a no Fly. Consequência actual: o dispositivo partilha a chave da nuvem, e cada login invalida o dispositivo anterior. Decisão: falhar explícito (sem conectores no dispositivo novo, com mensagem clara) em vez de rodar por baixo; a rotação passa a ser acto de operação, não efeito de login. | `platform/provisioner/server.js` (`createComposioDeviceKey`), `platform/web/src/app/device/engine-key/route.ts` | Teste: `/device-key` não chama `regenerate_api_key`; dois logins seguidos não invalidam a chave do primeiro. |

**Publicação:** S1/S2 são motor → ZIP do motor + imagem do tenant. S3 é provisionador + plataforma.

---

### Onda L — o broker deixa de aparecer, e deixa de poder voltar

O nome já é traduzido na camada de labels. Escapa por três caminhos: texto que vem do próprio broker, copy de plugins fora dessa camada, e ausência de guarda-freios.

| ID | Trabalho | Ficheiros | Verificação |
|---|---|---|---|
| **L1** | `sanitizeProductCopy()` e `scripts/check-user-facing-brand.mjs` passam a cobrir o broker (nome, domínio, nome da variável de ambiente). Hoje ambos só conhecem Wayne/Hermes/Nous — por isso qualquer string nova reintroduz a fuga sem ninguém notar. | `apps/shared/src/product-copy.ts`, `scripts/check-user-facing-brand.mjs` | O check reprova numa string de teste com o nome do broker; suíte de `product-copy.test.ts` estendida. |
| **L2** | Sanitizar os boundaries de erro que hoje passam ao lado: erro inline no chat, toast e notificação nativa do evento de gateway, overlay de falha de arranque. O erro do broker sobe verbatim porque o gateway usa `notify()` directo em vez de `notifyError()` (que tem a regra de sumarização). | `assistant-ui/thread/assistant-message.tsx`, `use-message-stream/gateway-event.ts`, `components/boot-failure-overlay.tsx` | Teste substitui a expectativa actual de `streaming.test.tsx` (que hoje **afirma** a fuga) por assert de copy neutra. |
| **L3** | Copy do motor e dos plugins: `doctor.py` (probe "OpenRouter API" + link de créditos), plugins de imagem/vídeo (`display_name`, prompt "OpenRouter API key", tag "OpenRouter-backed"), pet-generate, `security_advisories.py`, a conquista "OpenRouter Enjoyer", e o painel de Tools que mostra `OPENROUTER_API_KEY` em mono. Alargar `humanizeProviderLabel` (hoje só faz match exacto em `^openrouter$`, por isso `"OpenRouter (image)"` passa). | `work4you_cli/doctor.py`, `plugins/image_gen/openrouter/`, `plugins/video_gen/openrouter/`, `agent/pet/generate/imagegen.py`, `plugins/wayne-achievements/`, `app/settings/toolset-config-panel.tsx` | `rg` limpo nas superfícies visíveis; check de marca no CI. |
| **L4** | Escrever a regra em `LINGUAGEM.md`: o intermediário é interno; o laboratório e o modelo são públicos; a excepção legal está em L5. | `docs/LINGUAGEM.md` | Revisão. |
| **L5** | **Não mexer** no parágrafo de operadores da política de privacidade sem jurídico. Nomear quem processa conteúdo do utilizador é a postura correcta em LGPD. Se quisermos o nome fora da copy comercial, o padrão é um anexo de subprocessadores referenciado pela política — decisão jurídica, não de engenharia. | `platform/web/src/app/privacidade/page.tsx` | Registo da decisão. |

**Publicação:** L2/L3 tocam o renderer → paridade completa (`build:web`, motor ZIP, imagem do tenant, casca). Ver `update-parity`.

---

### Onda C — isolamento real do Composio

O modelo forte já está escrito, mas `ensureComposioProject` é chaveado pelo **nome da app Fly**. Tenant dedicado = uma app = um projeto (correcto). Motor partilhado = uma app para todos = **um projeto para todos**, e `_write_tenant_env` só escreve a chave de modelos, pelo que cada pedido cai no secret partilhado do processo. No sítio onde estão os utilizadores cloud, a única fronteira é o prefixo do `user_id` — e esse prefixo é o nome da pasta do tenant, previsível.

| ID | Trabalho | Ficheiros | Verificação |
|---|---|---|---|
| **C1** | Chavear o projeto Composio por **tenant**, não por app Fly, para o motor partilhado ter um projeto por cliente como os dedicados. | `platform/provisioner/server.js` | Dois tenants no mesmo motor recebem `projectId` distintos. |
| **C2** | Entregar a chave do projeto pelo caminho que já existe: `/internal/tenant-runtime` passa a incluí-la e `_write_tenant_env` a persistir no `.env` do tenant. Com isso o fallback para o secret do processo deixa de ser normal e passa a ser sinal de erro. | `platform/web/src/app/internal/tenant-runtime/route.ts`, `work4you_cli/platform_tenant.py` | Teste: tenant sem chave própria não herda a do processo. |
| **C3** | `user_id` opaco por tenant em vez de slug adivinhável. **Item de maior fricção:** as contas ligadas na Composio são indexadas pelo `user_id`; mudá-lo torna as ligações existentes invisíveis. Plano: leitura dupla (novo e antigo) durante a transição, e só depois cortar o antigo. Se a Composio não permitir reatribuir, aceitar reconexão com aviso agendado — nunca silenciosa. | `work4you_cli/web_server.py` (`_connector_user_id`, `_connector_event_scope`) | Teste de leitura dupla; contas antigas continuam a aparecer durante a transição. |
| **C4** | Segredo de assinatura de eventos por tenant. Hoje vive no config do home por omissão e, depois de validar o HMAC, é o `user_id` do payload que escolhe em que home escrever. | `work4you_cli/web_server.py` (`_connectors_webhook_secret`) | Teste: evento assinado com o segredo do tenant A não escreve no home de B. |

**Nota factual:** não guardamos password de utilizador final. Os conectores usam auth gerida pela Composio, os tokens OAuth ficam lá, e nós retemos ids de conta, estado e o `redirect_url`. A criação do projeto já liga `mask_secret_keys_in_connected_account`. O risco é a superfície de **controlo** das contas, não as credenciais — daí S2 e C1–C3.

---

### Onda G — gateway de modelos (a peça estrutural)

O que torna as invariantes 1 e 2 reais em vez de cosméticas. O blueprint é o provider `nous`: copiamos a mecânica, mudamos os hosts e as claims.

| ID | Trabalho | Ficheiros | Verificação |
|---|---|---|---|
| **G1** | Endpoints do nosso portal, espelhando o que o motor já sabe consumir: `POST /api/oauth/device/code`, `POST /api/oauth/token` (device code + refresh com rotação), `GET /api/oauth/account` (plano, créditos, entitlements). | `platform/web/src/app/api/oauth/` | Fluxo completo contra o motor sem alterar o cliente além de G2. |
| **G2** | Provider `work4you` no motor, espelho do `nous`: `auth_type="oauth_device_code"`, `resolve_*_runtime_credentials`, entrada no credential pool, keepalive, allowlist do nosso host de inferência (padrão `_ALLOWED_NOUS_INFERENCE_HOSTS`). | `work4you_cli/auth.py`, `runtime_provider.py`, `plugins/model-providers/` | Testes de paridade com os do `nous`. |
| **G3** | Gateway: guarda a chave do broker do lado servidor, aplica allow-list de modelos, tecto de gasto e RPM/TPM **por tenant**, e emite as credenciais curtas. Decisão pendente: reactivar `platform/model-proxy` (LiteLLM, chaves virtuais e budgets prontos) ou rota na plataforma. Se LiteLLM: fixar o mapa de custos (`LITELLM_LOCAL_MODEL_COST_MAP`) para não cair silenciosamente em preços velhos, e considerar `dynamic_rate_limiter_v3` para partilha justa em saturação. | `platform/model-proxy/` ou `platform/web` | Carga: tenant A esgotar o tecto não afecta B; medir latência acrescentada (ver riscos). |
| **G4** | `/device/engine-key` deixa de entregar a chave do broker e passa a entregar credencial renovável; o `.env` do cliente deixa de a conter. **Cutover:** o gateway aceita ambos durante a transição e a chave só deixa de descer quando houver piso de versão do cliente. | `platform/web/src/app/device/engine-key/route.ts`, `apps/work4you/electron/w4y-login.cjs` | Cliente antigo continua a funcionar; cliente novo nunca escreve a chave no disco. |
| **G5** | ID de modelo estável nosso. Os slugs actuais (`anthropic/claude-...`) têm a forma do broker e são a **chave de armazenamento** em config, sessões e registos de custo. Indo directo a um laboratório, o id canónico muda de forma. Barato agora, caro depois de haver histórico. | `work4you_cli/models.py`, `model_metadata.py`, config e sessões | Roteamento por id nosso; slug do fornecedor é detalhe do gateway. |
| **G6** | Nomes de campo neutros na API (`openrouterApiKey`, `envVar: "OPENROUTER_API_KEY"` na resposta do engine-key) e links de ajuda para docs nossos em vez de `openrouter.ai/keys`. Fecha o resíduo que L1–L3 não alcançam por não ser copy. | `platform/web/src/app/device/engine-key/route.ts`, `app/settings/constants.ts`, `components/onboarding/` | DevTools da casca não identifica o broker. |

---

### Onda D — colher a substituibilidade

Só depois de G. É aqui que o investimento paga.

| ID | Trabalho |
|---|---|
| **D1** | Contratos directos com laboratórios, modelo a modelo, atrás do gateway. Arrancar um modelo novo pelo broker e migrar quando o volume justificar, sem release do cliente. Ver PR #31 para os travões: tectos de gasto directos são mais duros (pausas de conta) e a aplicação de orçamento por tenant, que hoje herdamos do broker, passa a ser nossa. |
| **D2** | Revisão de preços com os números reais do gateway. Nota da conversa: nos planos actuais, um utilizador que consuma a totalidade dos créditos incluídos deixa margem negativa. Com medição por tenant no gateway isto deixa de ser estimativa. |
| **D3** | Fechar L5 com jurídico: como declarar subprocessadores quando o roteamento passa a ser misto (broker + directo). |

---

## Dependências

```
S1 S2 S3   ──┐
L1 L2 L3 L4 ─┼─→  (independentes entre si; podem ir em paralelo)
             │
C1 → C2 → C3 → C4        (C3 precisa de C1/C2 em produção)
             │
G1 → G2 → G3 → G4 → G6
        G5 ──┘           (G5 antes de D1, senão a migração parte ids)
                    └──→ D1 → D2
```

- **S** e **L** não bloqueiam nada e tiram exposição já.
- **C3** é o único item com risco de fricção visível ao utilizador (reconexão de contas). Não entra sem a leitura dupla.
- **G4** é o único cutover com risco de quebrar clientes instalados. Não entra sem piso de versão.

---

## Riscos e travões

| Risco | Travão |
|---|---|
| Mudar o `user_id` órfã as contas Composio ligadas | Leitura dupla durante a transição; corte só depois; se houver reconexão, é avisada e agendada (C3) |
| O gateway passa a estar no caminho crítico — se cai, o produto cai | Manter BYOK como escotilha; failover para chamada directa **do lado servidor**; health check no arranque |
| Latência: o `model-proxy` foi parqueado por causa disto | Medir p50/p95 acrescentados vs directo antes de o tornar caminho único; garantir passthrough de streaming sem buffering |
| Rate limiting distribuído é aproximado (deriva de dezenas de pedidos com várias instâncias) | Tecto de gasto é a barreira dura; RPM/TPM é qualidade de serviço, não contabilidade |
| Preços desactualizados no gateway inflacionam ou subestimam custo | Fixar mapa de custos e testar contra a factura real do broker |
| Publicar só a casca quando o renderer mudou desalinha o utilizador cloud | Regra `update-parity`: `build:web` → motor ZIP → imagem do tenant → casca |
| Esconder o broker no sítio errado (legal) | L5: produto esconde, legal declara |

---

## Não-objectivos

- **Não** remover BYOK nem esconder capacidades atrás de "simplificação". Jargão pode ser reagrupado em Avançado; nunca apagado.
- **Não** esconder o laboratório nem o modelo. O utilizador escolhe por eles.
- **Não** dividir contas no fornecedor para contornar limites — viola termos e não cria capacidade.
- **Não** tocar no parágrafo de operadores da privacidade sem jurídico.
- **Não** tratar o `.wayne.py` como código a editar à mão: é gerado (ver `prepare-fly-overlay.mjs` e o workflow de paridade).

---

## Definição de pronto por onda

- **S:** testes de regressão para os três furos; nenhum caminho autenticado devolve chave da plataforma nem age em recurso de outro tenant.
- **L:** CI reprova a reintrodução do nome do broker em superfície visível; `streaming.test.tsx` afirma copy neutra.
- **C:** dois tenants no motor partilhado com projetos Composio distintos; evento assinado por um não escreve no outro.
- **G:** cliente novo funciona sem chave de fornecedor no disco; tecto e limites aplicados por tenant no servidor; cliente antigo continua a funcionar.
- **D:** um modelo servido por contrato directo sem que o cliente saiba, e preços revistos com medição real.
