# Migração legacy → Fly dedicada `wayne-<slug>`

Claude v1: **1 email = 1 app Fly**. O motor partilhado (`wayne-w4y` +
`W4Y_SHARED_MOTOR`) está **revogado**. Clientes nunca voltam a esse caminho.

## Caminho automático (preferido)

No login, `/login/enter` chama `ensureDedicatedFlyInstance`:

- Se `instances.fly_app` está vazio ou é `wayne-w4y` → actualiza para
  `wayne-<slug>`, status `provisioning`, e dispara o provisionador.
- O utilizador vê `/instancias?migrar=dedicada` até a máquina ficar `ready`.
- Retry manual: `POST /onboarding/retry` (mesmo helper).

Não é preciso script SQL para contas que ainda façam login.

## Script SQL (só contas órfãs / `dev-tenant`)

Utilizadores ainda mapeados a `dev-tenant` (pré-F1) podem precisar do script
histórico:

```powershell
cd platform/infra
$env:DATABASE_URL = (gcloud secrets versions access latest --secret=w4y-web-database-url)
.\migrate-legacy-wayne-w4y.ps1          # dry-run
.\migrate-legacy-wayne-w4y.ps1 -Apply
```

Depois o login/enter trata o provisionamento.

## Lab `wayne-w4y`

Fica só como fábrica de imagem / lab W4Y. **Não** roteia clientes
(`router-w4y` recusa `w4y_route=wayne-w4y`). Não reactivar
`W4Y_SHARED_MOTOR=1` nem `configure-shared-motor-fly.ps1`.

## O que NÃO fazer

- Não apontar Free/QA de cliente para `wayne-w4y`
- Não destruir o volume do lab até arquivos W4Y internos estarem seguros
- Não reutilizar tags de imagem no provisioner sem bump (ver BACKEND-MAP.md)
