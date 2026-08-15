# Migração legacy `dev-tenant` / `wayne-w4y`

Utilizadores mapeados a `dev-tenant` partilham a instância Fly `wayne-w4y`. O modelo alvo é **1 app Fly por tenant** (`wayne-{slug}`).

## Quando usar

- Utilizador reporta sessões/dados misturados com outros early adopters
- Novo signup já vai para tenant próprio (`t-{slug}`); só contas antigas precisam disto

## Pré-requisitos

- `DATABASE_URL` apontando ao registry Cloud SQL
- `psql` no PATH (ou Cloud SQL Auth Proxy)
- Provisionador e casca web em produção

## Passos

1. **Dry-run** — lista e-mails a migrar:

   ```powershell
   cd platform/infra
   $env:DATABASE_URL = (gcloud secrets versions access latest --secret=w4y-web-database-url)
   .\migrate-legacy-wayne-w4y.ps1
   ```

2. **Apply** — actualiza `users.tenant_id` e cria linhas `instances` + `billing`:

   ```powershell
   .\migrate-legacy-wayne-w4y.ps1 -Apply
   ```

3. **Provisionar** — para cada tenant novo em `provisioning`:
   - Opção A: utilizador faz logout/login (FREE_OPEN dispara auto-provision só para contas sem tenant — aqui já têm tenant, usar retry)
   - Opção B: POST manual ao provisionador com HMAC (ver `platform/provisioner/server.js`)
   - Opção C: utilizador abre `/onboarding` e clica **Tentar de novo** (rota `/onboarding/retry`)

4. **Validar** — `/login/enter` → cookie `w4y_route=wayne-{slug}`; chat no tenant isolado

## O que NÃO fazer

- Não destruir `wayne-w4y` até todos migrarem (dados no volume)
- Não reutilizar tag de imagem no deploy do provisioner (ver BACKEND-MAP.md)

## Rollback

Reverter `users.tenant_id` para `dev-tenant` manualmente no SQL; instância nova pode ficar `archived` via recycle.
