#!/bin/sh
# Entrypoint Fly.io para o Wayne Agent — substitui o /init (s6-overlay).
#
# No Fly Machines (Firecracker), o init do Fly é o PID 1 e executa o
# entrypoint da imagem como filho. O s6-overlay recusa rodar fora do PID 1
# (s6-overlay-suexec e s6-linux-init checam getpid()==1), então este script
# replica o que o boot s6 fazia, na mesma ordem:
#   1. popular /run/s6/container_environment (contrato do with-contenv,
#      usado pelos shebangs dos hooks e do serviço dashboard);
#   2. rodar os hooks /etc/cont-init.d/* em ordem (00-seed, 01-wayne-setup,
#      015-supervise-perms, 02-reconcile-profiles);
#   3. subir o dashboard (serviço s6 'dashboard') em background com retry
#      simples, e exec no main-wrapper (gateway run) em foreground.
# O reaping de zumbis fica com o init do Fly (PID 1), como faria o tini.
set -e
export PATH=/command:/usr/bin:/bin:$PATH

# -- 1. env store do with-contenv (o stage1 do s6 faria isto) --------------
mkdir -p /run/s6/container_environment
python3 - <<'PY'
import os
base = "/run/s6/container_environment"
for k, v in os.environ.items():
    # nomes de env são sempre caminhos seguros (sem / ou ..)
    if "/" in k or k in (".", ".."):
        continue
    with open(os.path.join(base, k), "w") as f:
        f.write(v)
PY

# -- 2. hooks cont-init.d em ordem lexicográfica ---------------------------
# 015-supervise-perms e 02-reconcile-profiles falam com o supervisor s6
# (scandir /run/service), que não existe neste modo — não-fatais. O gateway
# do perfil default que o 02 registraria É o nosso processo principal.
# Os demais hooks abortam o boot se falharem (sem bootstrap não há serviço são).
for hook in /etc/cont-init.d/*; do
    [ -f "$hook" ] || continue
    case "$(basename "$hook")" in
        015-*|02-*) "$hook" || echo "[init-fly] aviso: hook $(basename "$hook") falhou (ignorado)" ;;
        *)          "$hook" ;;
    esac
done

# -- 2b. durabilidade: litestream (restore se faltar + replicação contínua) -
# Só ativa quando o app tem bucket Tigris (BUCKET_NAME via fly storage).
# Restore roda ANTES do gateway criar bancos novos: num volume virgem puxa
# a última réplica; num volume com dados, -if-db-not-exists não toca nada.
if command -v litestream >/dev/null 2>&1 && [ -n "${BUCKET_NAME:-}" ]; then
    for db in state.db kanban.db memory_store.db projects.db; do
        litestream restore -if-db-not-exists -if-replica-exists "/opt/data/$db" \
            || echo "[init-fly] aviso: restore litestream de $db falhou (segue sem)"
    done
    litestream replicate &
    echo "[init-fly] litestream replicando para o bucket ${BUCKET_NAME}"
fi

# -- 3. dashboard em background (com retry) + gateway em foreground --------
DASH_RUN=/etc/s6-overlay/s6-rc.d/dashboard/run
if [ -x "$DASH_RUN" ]; then
    (
        while :; do
            "$DASH_RUN"
            code=$?
            # 0 = shutdown limpo; 125 = dashboard desabilitado. Não religar.
            if [ "$code" -eq 0 ] || [ "$code" -eq 125 ]; then exit 0; fi
            echo "[init-fly] dashboard saiu com código $code; religando em 2s"
            sleep 2
        done
    ) &
fi

exec /opt/wayne/docker/main-wrapper.sh "$@"
