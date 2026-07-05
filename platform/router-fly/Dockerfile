# Roteador de sessão (fly-replay) — imagem mínima.
FROM node:22-alpine
WORKDIR /app
COPY server.js .
# CRLF safety (build em Windows)
RUN sed -i 's/\r$//' server.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
