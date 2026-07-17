# w4y-model-proxy — LiteLLM na frente da OpenRouter (estilo Cursor)

Proxy de modelo do pivô desktop. **v1 = pass-through transparente**: o
cliente (motor local do tenant) continua mandando a **chave OpenRouter capada
DELE** no header `Authorization`; o proxy repassa verbatim pra OpenRouter.
O teto server-side por tenant continua valendo na OpenRouter — o que ganhamos
é o **ponto de observação/corte NOSSO** no caminho.

- Modo LiteLLM: `general_settings.pass_through_endpoints` com
  `forward_headers: true` (doc: <https://docs.litellm.ai/docs/proxy/pass_through>).
  Router mode NÃO serve pro v1: o LiteLLM **nunca** repassa o `Authorization`
  do cliente nas rotas nativas (<https://docs.litellm.ai/docs/proxy/forward_client_headers>).
- Endpoint OpenAI-compatible exposto:
  `https://w4y-model-proxy.fly.dev/openrouter/v1/chat/completions`
  (qualquer modelo que a OpenRouter aceite — o body passa intocado; streaming
  SSE passa). Prefixo `/openrouter` de propósito: a rota nativa `/v1/*` do
  LiteLLM é registrada primeiro e sombrearia um pass-through em `/v1`.
- Fase 2 (FORA deste escopo): chaves viram virtuais no proxy (router mode +
  `model_list` wildcard `openrouter/*` — bloco comentado no `config.yaml`).

## Deploy (⛔ NÃO EXECUTAR AINDA — flip é gated, ver seção FLIP)

```powershell
cd "C:\DEV\W4Y Labs\platform\model-proxy"

# 1. Build + push da imagem (REGRA: tag mpN NUNCA reutilizada — mp1, mp2, ...)
docker build -t registry.fly.io/w4y-model-proxy:mp1 .
fly auth docker
docker push registry.fly.io/w4y-model-proxy:mp1

# 2. Primeira vez só: criar o app e o secret do master key
#    (o master key protege as rotas NATIVAS/admin do LiteLLM; o pass-through
#    /openrouter NÃO usa ele — a OpenRouter é quem autentica a chave do tenant)
fly apps create w4y-model-proxy
fly secrets set -a w4y-model-proxy LITELLM_MASTER_KEY="sk-w4y-$( -join ((48..57)+(97..122) | Get-Random -Count 32 | % {[char]$_}) )"

# 3. Deploy pela imagem (NUNCA --dockerfile — gotcha do overlay)
fly deploy -a w4y-model-proxy -c fly.toml --image registry.fly.io/w4y-model-proxy:mp1
```

Rollback: só por tag anterior/digest (`fly deploy --image registry.fly.io/w4y-model-proxy:mpN-1`).

## Validação pós-deploy

```powershell
# 1. Vivo?  (esperado: 200 {"status":"..."} / "I'm alive!")
curl.exe -s https://w4y-model-proxy.fly.dev/health/liveliness

# 2. Chat completion VIA proxy com uma chave OpenRouter de TESTE
#    (<KEY> = chave capada de um tenant de teste; NUNCA colar chave real em doc/commit)
curl.exe -s https://w4y-model-proxy.fly.dev/openrouter/v1/chat/completions `
  -H "Authorization: Bearer <KEY>" `
  -H "Content-Type: application/json" `
  -d '{\"model\":\"anthropic/claude-sonnet-4.6\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":16}'

# 3. Sem auth → 401 vindo DA OPENROUTER ("No auth credentials found")
#    = prova que o repasse acontece e que o proxy não aceita anônimo
curl.exe -s -o NUL -w "%{http_code}" https://w4y-model-proxy.fly.dev/openrouter/v1/chat/completions `
  -H "Content-Type: application/json" -d '{\"model\":\"x\",\"messages\":[]}'

# 4. Rota nativa continua trancada (401 do LiteLLM, sem master key)
curl.exe -s -o NUL -w "%{http_code}" https://w4y-model-proxy.fly.dev/v1/chat/completions `
  -H "Content-Type: application/json" -d '{\"model\":\"x\",\"messages\":[]}'
```

Streaming: repetir o passo 2 com `"stream": true` — a resposta deve chegar
como SSE (`text/event-stream`) via proxy.

### Validação local já executada (17/07, docker run desta config, SEM chave real)

| Probe | Resultado observado |
|---|---|
| `GET /health/liveliness` | 200 |
| `POST /openrouter/v1/chat/completions` sem Authorization | **401 da OpenRouter** `{"error":{"message":"No cookie auth credentials found","code":401}}` |
| idem com chave fake `sk-or-v1-000…` | **401 da OpenRouter** `{"error":{"message":"User not found.","code":401}}` — prova que o header do cliente chegou na OpenRouter |
| `POST /v1/chat/completions` (rota nativa, sem master key) | 401 **do LiteLLM** (`auth_error`) — rotas nativas trancadas |
| `GET /openrouter/v1/models` | 200 (catálogo público via proxy) |

## O FLIP (documentado, ⛔ GATED — não mover tráfego de usuário agora)

O runtime do agente já aceita `base_url` custom OpenAI-compatible
(`cli.py:3833-3837`; `auxiliary_client.py` cita "LiteLLM proxies" como
suportado). Flip = **config-only, zero código**:

| Config do cliente/tenant | Hoje | Depois do flip |
|---|---|---|
| `model.base_url` | `https://openrouter.ai/api/v1` | `https://w4y-model-proxy.fly.dev/openrouter/v1` |
| Chave (`OPENROUTER_API_KEY` / Authorization) | chave capada do tenant | **a mesma** (inalterada) |
| Nome do modelo | id OpenRouter (ex.: `anthropic/claude-sonnet-4.6`) | **o mesmo** (inalterado) |

Reversão do flip = voltar o `base_url`. Nada muda em chave nem em modelo.

> **GOTCHA verificado (cli.py:3841-3844)**: quando o `base_url` deixa de casar
> com o host `openrouter.ai`, o runtime passa a preferir `OPENAI_API_KEY`
> antes de `OPENROUTER_API_KEY`. No dispositivo do tenant só existe
> `OPENROUTER_API_KEY` (fallback funciona), mas se algum ambiente tiver
> `OPENAI_API_KEY` setada, ela ganharia — conferir antes de flipar.

**GATILHOS APROVADOS pra executar o flip** (qualquer um):
1. **Abuso real** — tenant/dispositivo abusando da chave capada e precisamos
   de corte imediato do nosso lado (block no proxy sem esperar a OpenRouter).
2. **Medidor ao vivo** — precisamos de telemetria de uso em tempo real no
   nosso caminho (dashboard de consumo, alertas).
3. **Enterprise** — cliente enterprise exigindo egress único/allowlist ou
   auditoria do tráfego de modelo.

Sem gatilho, o proxy fica no ar (min=1, custo shared-cpu-1x/512MB) apenas
como opção pronta; tráfego de usuário segue direto na OpenRouter.

## Riscos / limitações conhecidos (v1)

- **Rotas são EXATAS, não wildcard de path** (gotcha VERIFICADO em código +
  container: `user_api_key_auth.py::check_api_key_for_custom_headers_or_
  pass_through_endpoints` só isenta auth quando o path da request é IGUAL ao
  `path` configurado). Com `include_subpath: true` os sub-paths caem na auth
  de virtual key do LiteLLM e a chave OpenRouter do tenant é engolida como
  chave LiteLLM inexistente. Pra expor outra rota da OpenRouter (ex.:
  `/v1/completions`), adicionar OUTRA entrada exata no `config.yaml` —
  nunca voltar pro `include_subpath`.
- **Latência**: +1 hop (cliente → Fly gru → OpenRouter). Ordem de dezenas de
  ms por request; irrelevante perto do tempo de inferência, mas medir no
  passo 2 antes de flipar tenants sensíveis.
- **Streaming**: pass-through do LiteLLM detecta `text/event-stream` e usa
  StreamingResponse (verificado no código do handler) — validar TTFB real
  no passo de streaming acima.
- **Headers especiais da OpenRouter** (`HTTP-Referer`, `X-Title`): com
  `forward_headers: true` passam se o CLIENTE mandar; o proxy não injeta.
  Se rankings/attribution da OpenRouter importarem, adicionar em `headers:`
  do endpoint no `config.yaml` (headers custom sobrescrevem os do cliente).
- **Observabilidade v1 é básica**: pass-through genérico não faz contagem de
  tokens/spend por tenant (isso é a Fase 2 com chaves virtuais). v1 dá logs
  de acesso (quem/quando/quanto tráfego) e o ponto de corte.
- **Memória**: LiteLLM em 512MB é apertado (RSS típico 300–500MB). Se OOM
  no Fly, subir pra `1024mb` no `fly.toml` — sem mudança de código.
- **Tag base móvel**: `main-stable` é ponteiro móvel do LiteLLM; nossa
  imagem `mpN` congela o digest no push. Registrar o digest do deploy:
  `docker inspect --format '{{index .RepoDigests 0}}' registry.fly.io/w4y-model-proxy:mp1`.
- **`/health/liveliness` é público** (sem auth) — é só liveness, sem dado.
