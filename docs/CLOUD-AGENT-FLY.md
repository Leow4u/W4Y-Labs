# Cloud Agent — publicar Fly sem sessao local

Objectivo: o agente Cursor **cloud** corre `publish-fly.sh` sem mudares para o PC.

## 1. Secret no Cursor (uma vez)

1. Abre https://cursor.com/dashboard/cloud-agents
2. Adiciona **Runtime Secret**:
   - Nome: `FLY_API_TOKEN`
   - Valor: o token Fly gerado no Desktop (`w4y-fly-cursor-cloud-token.txt`)
3. Scope: ambiente / repo W4Y Labs
4. Guarda. Arranca um Cloud Agent **novo**.

## 2. Token Fly

Gerado no PC (org personal, 90 dias, nome `cursor-cloud-w4y`).
Revogar em https://fly.io/user/personal_access_tokens se vazar.

```powershell
fly tokens create org -o personal -n cursor-cloud-w4y -x 2160h
```

## 3. Build do ambiente

`.cursor/environment.json` corre `.cursor/install-cloud-tools.sh` (instala flyctl).
Apos push: dashboard do ambiente -> **New Build**.

## 4. Comando

```bash
export PATH="$HOME/.fly/bin:$PATH"
cd wayne-agent/apps/work4you && npm run build:web
bash platform/infra/publish-fly.sh --skip-provisioner --tenant-tag fly256 --base-tag fly252
```

## 5. Limites

| Accao | Cloud com FLY_API_TOKEN? |
|---|---|
| Overlay wayne-w4y:flyN | Sim |
| fly logs / ssh / machine update | Sim |
| Provisioner (docker) | So com Docker no environment |
| deploy-web / GCS | Nao (gcloud) |