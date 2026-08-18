# Cloud Agent — publicar Fly sem sessão local

Objectivo: o agente Cursor **cloud** corre `publish-fly.sh` com as mesmas credenciais Fly, sem mudares para o PC.

## 1. Secret no Cursor (uma vez)

1. Abre [Cloud Agents → Secrets](https://cursor.com/dashboard/cloud-agents).
2. Adiciona **Runtime Secret** (não Environment Variable — o valor fica redacted no chat):
   - Nome: `FLY_API_TOKEN`
   - Valor: o token gerado abaixo
3. Scope: o ambiente / repo **W4Y Labs**.
4. Guarda. Arranca um Cloud Agent **novo** (secrets de utilizador entram no start).

## 2. Gerar o token Fly (no PC, uma vez)

Org `personal` (leo@work4you.ai), validade 90 dias:

```powershell
fly tokens create org -o personal -n cursor-cloud-w4y -x 2160h
```

Copia o token **uma vez** para o Secrets tab. Não commits, não coloques em `.env` do repo.

Revogar depois em [Fly dashboard → Tokens](https://fly.io/user/personal_access_tokens) se vazar.

## 3. Ferramentas no Build

`.cursor/environment.json` corre `.cursor/install-cloud-tools.sh` (instala `flyctl`).
Depois de commit + push, no dashboard do ambiente: **New Build** / **Update with Agent** para a imagem incluir o CLI.

## 4. Comando que o agente usa

```bash
export PATH="$HOME/.fly/bin:$PATH"
cd wayne-agent/apps/work4you && npm run build:web   # se a UI mudou
bash platform/infra/publish-fly.sh --skip-provisioner \
  --tenant-tag fly256 --base-tag fly252
```

## 5. O que ainda precisa de local / outro secret

| Acção | Cloud com `FLY_API_TOKEN`? |
|---|---|
| Overlay tenant `wayne-w4y:flyN` | Sim |
| `fly logs` / `fly ssh` / machine update | Sim |
| Provisioner docker build+push | Só se o Cloud Environment tiver Docker |
| `deploy-web.ps1` (Cloud Run) | Não — precisa gcloud/ADC ou OIDC GCP |
| Upload casca GCS | Não — precisa gcloud |

## 6. Verificação rápida

```bash
fly auth whoami
fly machine status 0802410f024208 -a wayne-w4y | head
```