# Serviço provisionador — Node + flyctl (as "mãos no Fly" da plataforma).
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -L https://fly.io/install.sh | FLYCTL_INSTALL=/usr/local sh \
    && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
ENV PATH=/usr/local/bin:$PATH
WORKDIR /app
COPY server.js .
RUN sed -i 's/\r$//' server.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
