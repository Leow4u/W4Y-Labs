# Credits

## Wayne Agent — derivado do Hermes Agent (Nous Research)

O runtime de agentes desta plataforma (**Wayne Agent**) é um fork adaptado do
[**Hermes Agent**](https://github.com/NousResearch/hermes-agent), criado pela
[Nous Research](https://nousresearch.com) e licenciado sob **MIT**.

- Repositório upstream: https://github.com/NousResearch/hermes-agent
- Documentação upstream: https://hermes-agent.nousresearch.com/docs/
- Licença original preservada integralmente em [`LICENSE-UPSTREAM`](./LICENSE-UPSTREAM)
  (MIT — Copyright (c) 2025 Nous Research)

Todo o mérito da arquitetura do runtime — loop de conversação, context engine,
sistema de skills com aprendizado contínuo, gateway multi-plataforma, cron
scheduler, backends de terminal (local/Docker/SSH/Modal/Daytona), sistema de
plugins e ferramentas — pertence à equipe e aos contribuidores do Hermes Agent.

As adaptações da W4Y Labs limitam-se a: renomeação (Hermes → Wayne), remoção de
superfícies específicas da Nous (portal/billing/instaladores/apps desktop),
ajustes de segurança para multi-tenancy e integração com a plataforma Work4You
(OpenRouter, Composio, Clerk, Supabase, Langfuse).

## Outras dependências

Ver `pyproject.toml` e `package.json` para a lista completa de bibliotecas de
terceiros e suas licenças.
