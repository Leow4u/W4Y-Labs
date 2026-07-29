# Arquivo — registo histórico, não instrução

**Regra: nada nesta pasta define o produto.** Se um documento aqui contradiz
`docs/PRODUTO.md`, quem manda é o `PRODUTO.md`. Sempre.

Estes ficheiros foram verdadeiros no dia em que foram escritos. Ficam porque
contêm decisões, medições e incidentes que custaram a aprender e que não
queremos reaprender. Não ficam para orientar trabalho novo.

**Se és um agente:** não tomes decisões de produto a partir de nada nesta
pasta. Consulta apenas para responder "porque é que isto ficou assim?" ou
"o que já tentámos?". Para saber o que construir, lê `docs/PRODUTO.md`.

## Porque é que este arquivo existe

Durante meses, cada alinhamento de produto gerou um ficheiro *novo* em vez de
actualizar o existente. O resultado foram várias descrições do produto a
coexistir e a contradizerem-se — e agentes a repetir decisões que já tinham
sido revertidas. A mais cara: a premissa de que o Work4You servia PME, revertida
pelo dono mais do que uma vez e mesmo assim continuamente ressuscitada, porque
estava escrita em ficheiros que os agentes liam como verdade.

**A regra que evita a repetição:** um alinhamento actualiza o documento que já
existe. Se substituir um documento inteiro, esse documento vem para aqui no
mesmo momento — não fica em `docs/` com um aviso no topo. Avisos no cabeçalho
não impedem a leitura; mudar de pasta impede.

## O que está aqui

| Documento | Data | O que era | Porque saiu |
|---|---|---|---|
| `PLANO-MESTRE-FABLE-5.md` | — (nunca commitado) | Plano de execução por fases para uma UI web+desktop unificada | Contradiz a direcção actual em três eixos: dizia PME-first, dizia que o desktop oficial era o `desktop-shell`, e dizia que a web era a superfície única de produto |
| `AUDITORIA-PRODUTO-WORK4YOU.md` | 23/07/2026 | Auditoria de produto: navegação, curadoria, ondas de implementação | Já se declarava LIXO no cabeçalho. Especifica uma jornada PME de ponta a ponta |
| `AGENT-STUDIO.md` | 23/07/2026 | Spec antiga do Agent Studio: linguagem natural → config, canvas ReactFlow, marketplace | Já se declarava substituído pelo `PRODUTO.md`. O canvas não é v1 |
| `ROADMAP.md` | 23/07/2026 | Roteiro por módulos M0–M5 | Substituído pelo `PRODUTO.md`; as fases de infra assentam num plano de Cloud Run entretanto abandonado |
| `MOCKUPS-V1-SPEC.md` | 22/07/2026 | Mocks de aceitação visual em `/mockups/v1` | Ligado às ondas da auditoria acima, também arquivada |
| `NATIVO-VS-CONSTRUIDO.md` | 22/07/2026 | Auditoria nativo × construído, com estimativa de desperdício em dias | Registo datado e válido. Sai porque é análise de um momento, não instrução — e porque o eixo do desktop mudou depois dela |
| `BACKEND-MAP-legado-web-shell.md` | 29/07/2026 | Secções do `BACKEND-MAP.md` sobre a SPA web (`web/src`, `RightDock.tsx`) e a casca fina `apps/desktop-shell` | Descrevem duas arquitecturas substituídas pelo `apps/desktop`. Uma delas está *invertida*: chama "nossa casca" ao `desktop-shell` e "parqueado" ao `apps/desktop` |

## O que foi salvo antes de arquivar

Factos concretos que estavam enterrados nestes documentos e que passaram para
documentos vivos ou para `PRODUTO.md`:

- **Desperdício medido:** ~20–35 dias a reconstruir a casca do desktop em vez de
  forkar o desktop Hermes; ~15–25 dias de excesso na máquina de estados do
  updater (`NATIVO-VS-CONSTRUIDO.md`).
- **Exclusões explícitas do Agent Studio v1:** sem canvas, sem compilador de
  workflow, sem entidade de equipas, sem marketplace, sem organização
  enterprise (`PRODUTO.md`, mantido).
- **A analogia estrutural:** Work4You está para o Hermes como o Cursor está
  para o VS Code (`PRODUTO.md`, mantido).
- **Os três elos dos conectores locais**, as duas paredes do Composio, o
  incidente da tag `p3` reutilizada e a lição de latência do proxy de modelo —
  salvos de `BACKEND-MAP-legado-web-shell.md` para `BACKEND-MAP.md`, secção
  "Factos duráveis salvos do pivô do desktop".
