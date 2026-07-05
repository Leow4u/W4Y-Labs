# Overlay Fly.io sobre a imagem Cloud Run do Wayne Agent.
# Única mudança: entrypoint init-fly (o s6-overlay exige PID 1, que no
# Fly Machines pertence ao init do próprio Fly — ver init-fly.sh).
# Build:  docker build --build-arg BASE_IMAGE=<imagem cloudrun> -t <tag> .
ARG BASE_IMAGE=wayne-agent:latest
FROM ${BASE_IMAGE}

COPY --chmod=0755 init-fly.sh /init-fly

# Litestream: replicação contínua dos SQLite p/ Tigris (restore no boot).
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream && rm /tmp/litestream.tar.gz
COPY litestream.yml /etc/litestream.yml

# Mesma rede de segurança CRLF do overlay cloudrun (build em Windows).
RUN sed -i 's/\r$//' /init-fly /etc/litestream.yml

ENTRYPOINT ["/init-fly"]
