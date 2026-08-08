# app.work4you.ai — DNS e load balancer (trilha E2)

Arquitectura alvo (ver `docs/PLATAFORMA.md`):

| Host | Backend | Conteúdo |
|------|---------|----------|
| `work4you.ai` | Cloud Run `w4y-web` | Login, billing, marketing |
| `app.work4you.ai` | Fly `router-w4y` | SPA (`app_dist`) + `/api/*` → tenant Wayne |

## 1. Fly — custom domain no router

```bash
fly certs add app.work4you.ai -a router-w4y
fly certs show app.work4you.ai -a router-w4y
```

Registo DNS (Cloud DNS ou registrador):

- **CNAME** `app` → `router-w4y.fly.dev` (ou A/AAAA que o `fly certs` indicar)

O `router-w4y` lê o cookie `w4y_route` e emite `fly-replay: app=wayne-{slug}`.

## 2. GCP — manter work4you.ai na casca

O tráfego de `work4you.ai` passa pelo **URL map GCP** `w4y-urlmap`: paths em whitelist vão para o backend **`w4y-web-backend`** (Cloud Run `w4y-web`, casca Next.js). Paths **não listados** caem no default (**Fly** / `wayne-fly-backend`, legado) — incluindo auth Wayne se a rota não estiver na whitelist.

Cloud Run domain mapping continua em work4you.ai → w4y-web (us-east1).

**Não** enviar tráfego de produto (/chat, /api/*) para Cloud Run — só paths da casca
(/, /login, /planos, /baixar, …).

Depois de novas rotas públicas em `platform/web`, correr:

```powershell
cd platform/infra
.\patch-url-map-web-paths.ps1
```

(O `-DryRun` exporta e mostra o YAML patched sem importar.)

Paths extra na whitelist (além dos já existentes): /download/*, /device/*, /abrir, /legal/*.

## 3. Variáveis (casca Cloud Run)

Definidas em `platform/infra/deploy-web.ps1`:

- `NEXT_PUBLIC_PLATFORM_ORIGIN=https://work4you.ai`
- `NEXT_PUBLIC_APP_ORIGIN=https://app.work4you.ai`
- `W4Y_APP_SUBDOMAIN=1`
- `W4Y_COOKIE_DOMAIN=.work4you.ai`

## 4. Variáveis (tenant Fly — provisioner)

Por tenant (secrets no provision):

- `W4Y_PLATFORM_SSO_SECRET` — igual a `PROVISIONER_SHARED_SECRET` da casca
- `W4Y_TENANT_ID` — id do tenant (`t-{slug}`)
- `W4Y_PLATFORM_ORIGIN=https://work4you.ai`

## 5. Fluxo pós-login (E1)

1. Utilizador autentica em `work4you.ai/login`
2. `GET /login/enter` grava `w4y_route` (`Domain=.work4you.ai`) e redirecciona para
   `https://app.work4you.ai/auth/platform-sso?ticket=…`
3. Router replay → tenant Wayne; `/auth/platform-sso` valida ticket e emite cookies de sessão
4. Redirect para `/chat`

## 6. Validação

- Certificado TLS activo em `app.work4you.ai`
- Login completo abre chat no subdomínio app (não em `work4you.ai/chat`)
- Logout na plataforma limpa `w4y_route` no domínio partilhado
