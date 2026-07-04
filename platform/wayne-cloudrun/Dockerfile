# Cloud Run overlay on top of the base Wayne Agent image.
# Keeps the (upstream-close) base image clean; all Cloud Run specifics live
# here in platform/. Build ARG points at the base image in Artifact Registry.
# Default is only to silence buildx's InvalidDefaultArgInFrom warning; the
# real base is always passed via --build-arg BASE_IMAGE=... by build-wayne-local.ps1.
ARG BASE_IMAGE=wayne-agent-base:latest
FROM ${BASE_IMAGE}

# Baked config template + the cont-init seed script that copies it into
# $WAYNE_HOME on every (ephemeral) cold start. Placed at 00- so it runs
# before stage2-hook (01-wayne-setup), which then chowns/chmods config.yaml
# to the wayne runtime user.
# Build context is platform/wayne-cloudrun/, so these are context-root paths.
COPY config.yaml /opt/wayne/cloudrun/config.yaml
COPY --chmod=0755 00-seed-cloudrun-config /etc/cont-init.d/00-seed-cloudrun-config

# Safety net: strip any CRLF from s6 service files + cont-init scripts. The
# base image is built on Windows, where git's autocrlf can turn the s6 `type`
# and `run` files (no extension → missed by *.sh eol=lf rules) into CRLF,
# which makes s6-rc-compile fail ("type must be oneshot, longrun, or bundle")
# and the container never binds $PORT. Normalizing here makes the final image
# robust regardless of how the base was checked out/built.
RUN find /etc/s6-overlay/s6-rc.d /etc/cont-init.d -type f -exec sed -i 's/\r$//' {} + 2>/dev/null || true

# Cloud Run's contract: container listens on $PORT (8080). The config above
# binds api_server to 0.0.0.0:8080. The service is deployed with args
# `gateway run` (which loads the api_server platform adapter).
