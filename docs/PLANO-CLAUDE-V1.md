# Work4You v1 — igual Claude Desktop (contrato fechado)

> **Status:** vigente. **Não se altera o norte a meio do trabalho.**
> Se um PR, agente ou conversa contradisser este ficheiro, **este ficheiro ganha**.
> Produto: [`PRODUTO.md`](./PRODUTO.md). Superfícies: [`PLATAFORMA.md`](./PLATAFORMA.md).

**Aprovado 18/08/2026.** Instalação nova a partir do site. Sem migração, sem chip como lançamento, sem estado antigo.

---

## A frase (se isto falhar, o plano falhou)

A pessoa entra em `work4you.ai`, descarrega a app, faz login, **abre uma pasta no PC**, e o agente (cérebro na nuvem) trabalha **nessa pasta**. A mesma conta no browser. Sem motor Python no instalador. Sem “estamos a acordar a máquina”.

Isto é **Claude Desktop**, não `claude.ai` numa janela, não Cursor, não L0.

---

## Proibido (não negociar “só desta vez”)

- Adiar a pasta do PC para v2 / “depois ligamos”.
- Voltar a meter Hermes/CPython/ZIP/`latest.json` no instalador ou no first-run.
- Tratar o chip de update como caminho de lançamento deste modelo.
- Congelar o browser (L0). **Revogado.**
- Dois cérebros (motor no PC **e** Fly a fazer o mesmo trabalho).
- Fork Code-OSS / “igual Cursor”.
- Extensão VS Code ou CLI tipo Claude Code neste v1.
- `loadURL` do site como app (a casca serve a SPA; a pasta é nativa).
- Produto diferente para “contas de teste”.
- Guardar ou migrar `%LOCALAPPDATA%\work4you` antigo. **Não existe.**
- Mudar este norte no meio de uma fatia porque “ficou difícil”.

---

## Arquitectura (não alucinar outra)

```
CÉREBRO     Fly wayne-<slug>     Hermes: modelo, sessão, Composio, cron, canais
CORPO       Casca Electron       Abrir pasta, ler/escrever, git, PTY  (já existe IPC)
JANELA WEB  app.work4you.ai      Mesma conta / sessões; disco da VM = extra (24/7)
SITE        work4you.ai          Login, planos, /baixar  (instalador NOVO)
UPDATE APP  latest.yml           Só a casca
UPDATE AGENTE  imagem Fly        Não é chip no PC
```

- **1 email = 1 app Fly.** Signup cria `wayne-<slug>`. `wayne-w4y` é lab/imagem interna W4Y — **nunca** runtime de cliente. Motor partilhado (`W4Y_SHARED_MOTOR`) está **revogado**.
- Pasta do utilizador = disco **Windows/macOS** via casca. O agente na Fly **manda** nessas mãos. Sem isto o produto é um site.
- Disco `/opt/data` na Fly = cron, canais, projectos na nuvem — **não** substitui “abrir pasta”.
- Wake: a app **já é a app**; nome/plano/sessões enchem em silêncio. Sem copy de infra.
- Planos: mesma experiência para toda a gente. Free pode `suspend`; a UI não fala nisso. Plus/Max `min=1` como billing já diz.

---

## Lançamento

1. Conta nova em `work4you.ai` (como se nunca tivesse havido produto).
2. Download do instalador **novo** em `/baixar` (não chip sobre instalação velha).
3. Login → abrir pasta → o agente edita **esse** repo.
4. Browser na mesma conta: chat/histórico/conectores SaaS alinhados; pasta do PC só na app.

---

## Fatias (ordem rígida — uma de cada vez)

| ID | Trabalho | Pronto quando |
|----|----------|----------------|
| **F0** | Este contrato nos docs | Agente novo não propõe motor no PC nem pasta-em-v2 |
| **F1** | Signup → 1 Fly `wayne-<slug>` | Conta nova tem máquina só dela; não cai em `wayne-w4y` |
| **F2** | Web first-class no tenant da sessão | Chrome, sem app: chat na Fly certa; wake silencioso |
| **F3** | Casca sem extrair motor; **ponte pasta/git/PTY → agente Fly** | Instalar do site, abrir pasta, o agente lê/escreve **esse** disco |
| **F4** | Gate/login sem esperar Python local | Sem spinner eterno; sem sessão → Continuar |
| **F5** | Conectores no tenant | Mesmas contas ligadas na web e na app |
| **F6** | Chip da app = só casca; agente = deploy Fly | Um número na casca; `/baixar` aponta o instalador deste modelo |
| **F7** | QA humano | Instalar **limpo** do site → login → abrir pasta → editar ficheiro; o mesmo email no browser |

**Não** avançar F3 sem F1 (app sem tenant = ecrã vazio).  
**Não** avançar F2 sem F1 (web numa Fly partilhada = o “estranho” de novo — caminho **apagado**).  
F4 pode acompanhar a casca quando F3 mexer no boot.

---

## Quem faz o quê

| Agente (nuvem) | Humano |
|---|---|
| Código, testes, PRs, limpeza, **este plano intacto** | Merge; Actions Desktop Windows `publish=true` quando a casca mudar |
| Não publica GCS sozinho | Instala do site (não chip) e valida pasta + web |
| Não “melhora” o norte | Provisioner/Fly no ar (secrets, quotas) |

---

## Fora deste v1 (não começar)

Extensão ACP · CLI `work4you` tipo Claude Code · ponte extra além de pasta/git/PTY da casca · Code-OSS · onda G (chave fora do disco).

---

## Definition of Done (resultado 100%)

Uma pessoa que **nunca** teve Work4You:

1. Cria conta no site.  
2. Descarrega e instala.  
3. Entra (espera curta, sem texto de servidor).  
4. Abre uma pasta no PC.  
5. Pede no chat para criar/editar um ficheiro **nessa pasta** — e o ficheiro aparece no Explorer.  
6. Abre `app.work4you.ai` com o mesmo email e vê a mesma conta/sessão.  
7. Não existe passo “a instalar o motor” nem pasta `wayne-agent` obrigatória.

Se 5 falhar, **não está feito** — mesmo que o chat na nuvem funcione.
