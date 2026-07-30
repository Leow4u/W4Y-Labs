# Auditoria de Operabilidade das Skills (2026-07-07)

> Contexto: ao testar `powerpoint` em conversa livre, a skill falhou (python-pptx e LibreOffice ausentes).
> Auditamos **as 72 SKILL.md do repositório** contra a realidade do container de produção
> (fly.io · Debian 13 headless · sem GPU · `uv` presente · Pillow/cryptography no venv ·
> **ausentes**: pip, LibreOffice, LaTeX, tesseract, pandoc, chromium-bin, GPU, apps macOS).
> Critério: o bloqueio MAIS DURO para a skill **funcionar de verdade** para um usuário final.

## Resumo

| Tier | Qtde | Significado |
|---|---|---|
| 🟢 `works_now` | **17** | Funciona HOJE só com as ferramentas nativas do agente |
| 🟡 `light_pip` | **5** (+1*) | Só falta pacote pip leve (instalável via `uv`, overlay fino) |
| 🔴 `heavy_system` | **11** | Precisa de binário pesado (LibreOffice/LaTeX) ou GPU/modelos multi-GB |
| 🔌 `connector_credential` | **12** | Precisa de credencial de serviço externo → é CONECTOR (MCP), não skill |
| ⚫ `incompatible_niche` | **27** | macOS-only, dev-only (github/software-development), GUI/desktop, interno |

\* `excel-presentations` (openpyxl) está instalada na instância mas não no repo — soma ao tier 🟡.

## 🟢 Funciona hoje (17)

architecture-diagram · ascii-art · baoyu-infographic · claude-design · design-md · excalidraw ·
frontend-design · theme-factory · doc-coauthoring · humanizer · p5js · popular-web-designs ·
pretext · sketch · songwriting-and-ai-music · obsidian · maps · arxiv · llm-wiki · polymarket ·
pptx-author · excel-author

Featured (web SkillsPage): inclui pptx-author (não powerpoint), excel-*, ocr, design skills,
youtube, research… Ver `FEATURED_SKILLS` em `wayne-agent/web/src/pages/SkillsPage.tsx`.

## 🟡 Pip leve — destravável com um overlay `uv pip install` (~100 MB total)

| Skill | Pacotes | Valor de negócio |
|---|---|---|
| excel-presentations | `openpyxl` | ALTO (Gerador de Excel) |
| youtube-content | `youtube-transcript-api` | ALTO (Conteúdo do YouTube) |
| ocr-and-documents | `pymupdf` + `pymupdf4llm` (~25 MB; **não precisa** tesseract p/ o caminho padrão) | ALTO (extração de documentos) |
| ascii-video | `numpy` + `scipy` | baixo (nicho) |
| jupyter-live-kernel | `jupyterlab` via uv tool | baixo (dev) |
| blogwatcher | binário Go único via curl (borderline) | baixo |

> Nota técnica: instalar NO VENV do agente (`uv pip install --python /opt/wayne/.venv/bin/python3 …`),
> num overlay Docker fino sobre a imagem fly (mesmo padrão do Dockerfile.ui). Persistente, sem rebuild da base.

## Day-0 potency wave (30/07/2026)

Product: ship a **curated kit**, not Browse Hub pre-installs. Study:
`skills-day0-potency-study` canvas + implement wave A/B.

**Promoted optional → `skills/` (kit):** concept-diagrams · creative-ideation ·
one-three-one-rule · qmd · 3-statement-model · dcf-model · comps-analysis ·
webapp-testing · web-artifacts-builder · mcp-builder · code-wiki ·
rest-graphql-debug · subagent-driven-development · docker-management.

**Not promoted:** `optional-skills/devops/cli` is **inference-sh-cli** (model/apps
gateway) — stays optional.

**Trimmed kit → `optional-skills/` + `skills.disabled` migrate `_config_version` 36:**
apple-* · comfyui · heartmula · vllm · llama-cpp · audiocraft · segment-anything ·
lm-evaluation-harness · computer-use · touchdesigner-mcp · petdex · dogfood ·
claude-code · codex · opencode · wayne-agent.

**Marketing waves (stay optional / featured catalog only):** hyperframes ·
baoyu-comic · stocks · lbo-model · adversarial-ux-test · scrapling.

Constant: `wayne_cli.skills_config.KIT_TRIMMED_TO_OPTIONAL_SKILLS`.

---


`docx` / `pdf` / `pptx` / `xlsx` em [anthropics/skills](https://github.com/anthropics/skills)
são **source-available, não Apache** — proibido redistribuir / derivar no kit.

| Acção | Estado |
|---|---|
| Removido do kit `skills/productivity/powerpoint` (LICENSE proprietária Anthropic) | feito |
| OSS no kit: `excel-author` + `pptx-author` (Apache, anthropics/financial-services) | mantido |
| Apache example-skills importados (crédito Anthropic + LICENSE + NOTICE) | feito — ver abaixo |
| Reimplementar Office do zero / acordo Anthropic / MCP MIT Excel | **ainda por decidir** |

### Apache 2.0 importados (crédito Anthropic)

**Kit (`skills/`):** `frontend-design`, `theme-factory`, `doc-coauthoring`

**Hub / optional:** `web-artifacts-builder`, `mcp-builder`, `webapp-testing`

Candidatos Apache ainda **não** importados (próxima onda): algorithmic-art,
brand-guidelines, canvas-design, internal-comms, slack-gif-creator, skill-creator…

## 🔴 Pesadas — decisão caso a caso

| Skill | Bloqueio | Vale? |
|---|---|---|
| **pptx-author** (OSS) | `python-pptx` (pip) — sem LibreOffice obrigatório | **SIM** — substitui o `powerpoint` proprietário no featured |
| ~~powerpoint~~ | ~~LibreOffice + poppler~~ | **removido** — LICENSE Anthropic proprietária |
| research-paper-writing | LaTeX/texlive (~300 MB–1 GB) + pips | Talvez (credibilidade); LaTeX serve também ao manim-video |
| manim-video | LaTeX + manim | Carona do LaTeX |
| comfyui · heartmula · vllm · llama-cpp · lm-evaluation-harness · audiocraft · segment-anything | **GPU + modelos multi-GB** | **NÃO neste container** (fly sem GPU; são skills de ML/dev — já ficam internas) |
| songsee | toolchain Go p/ compilar | Não (nicho) |

## 🔌 Conectores disfarçados (12) — movidos 29/07/2026

huggingface-hub · himalaya (e-mail) · gif-search (Tenor) · weights-and-biases · airtable ·
google-workspace · **nano-pdf** (o CLI usa um LLM próprio → exige API key!) · notion ·
teams-meeting-pipeline (MS Graph) · openhue (bridge físico na LAN — inalcançável da nuvem) ·
xurl (X/Twitter pago) · yuanbao (Tencent)

> **Estado:** saíram de `skills/` → `optional-skills/` (não entram no kit default).
> Config migrate `_config_version` 34 uniõe estes nomes em `skills.disabled` para
> cópias já semeadas em `~/.wayne/skills/`. Lar de produto = **Conectores**
> (Composio). Constante: `wayne_cli.skills_config.CONNECTOR_DISGUISED_SKILLS`.

## ⚫ Incompatíveis / nicho (27) — ficam internas (`?full=1`)

- **macOS-only (4):** apple-notes, apple-reminders, findmy, imessage (dirigem apps do macOS)
- **Agentes de código (4):** claude-code, codex, opencode, wayne-agent (meta)
- **GUI/desktop (2):** computer-use (sem display no servidor), touchdesigner-mcp
- **Interno/demo (2):** dogfood (QA interno), petdex (mascotes de terminal)
- **Dev-only (15):** github/* (6) e software-development/* (9)

## Lição de UX descoberta no teste

`/web-research-competitive-intelligence …` **falha** ("not a quick/plugin/skill command"):
skill **não é comando de barra**. Skills são auto-selecionadas pelo agente a partir da descrição
da tarefa em linguagem natural (ex.: "faça uma pesquisa de mercado sobre a empresa Dutelog").
Ideia futura (estilo Manus, botão "Experimente"): no modal de detalhe da skill, um botão que abre
o chat com um prompt de exemplo pré-preenchido.

## Plano em ondas ("sistema operante")

- **Onda A — só curadoria (custo 0):** promover ao featured as `works_now` de valor de negócio
  (humanizer, sketch, arxiv, polymarket…), 7 → ~11.
- **Onda B — overlay pip (~100 MB, custo ≈ 0):** openpyxl, youtube-transcript-api, pymupdf(+4llm)
  → devolve Gerador de Excel, Conteúdo do YouTube e OCR ao featured (~14).
- **Onda C — Office OSS:** aprofundar `pptx-author` / `excel-author` (código nosso ou
  OSS limpo). **Não** vendor Anthropic `pptx`/`xlsx` proprietários. LibreOffice
  só se o caminho OSS o exigir (QA visual), não como justificação para copiar
  a skill proprietária.
- **Onda D — LaTeX (opcional):** research-paper-writing compilando PDF + manim-video.
- **Permanente fora (não é bug):** GPU/ML, macOS, GUI, dev-tools — internos ou não aplicáveis.
- **Conectores:** os 12 credenciados via workstream Conectores/MCP.
