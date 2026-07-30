/**
 * skill-curation — friendly pt-BR display names for the FEATURED catalog skills
 * (Onda E · PR-10 E1 · GAP-INT-05).
 *
 * The marketplace shows the catalog's ORIGINAL (English, technical) names, which
 * confuse most users. Rather than translate all ~100 skills, we curate a friendly
 * pt-BR title for the ~16 featured ones (the same set surfaced in SkillsPage),
 * keeping the technical `identifier` visible as a subtitle so power users and
 * install commands still line up. Non-pt locales keep the original name.
 */

/** Featured skill identifier → friendly pt-BR title. Keys mirror the technical
 *  skill names (see SkillsPage FEATURED_SKILLS). */
const PT_DISPLAY: Record<string, string> = {
  // Produtividade / documentos
  "excel-presentations": "Planilhas e relatórios (Excel)",
  "excel-author": "Planilhas auditáveis (Excel)",
  "pptx-author": "Apresentações (PowerPoint)",
  "doc-coauthoring": "Co-autoria de documentos",
  "ocr-and-documents": "Ler documentos e OCR",
  maps: "Mapas e rotas",
  obsidian: "Notas no Obsidian",
  // Criação visual
  "architecture-diagram": "Diagramas de arquitetura",
  "baoyu-infographic": "Infográficos",
  "claude-design": "Design com IA",
  "frontend-design": "Direção visual de UI",
  "theme-factory": "Temas de cor e tipografia",
  excalidraw: "Quadros e desenhos (Excalidraw)",
  sketch: "Esboços e wireframes",
  // Texto
  humanizer: "Humanizar texto",
  "concept-diagrams": "Diagramas de conceito",
  "creative-ideation": "Ideação criativa",
  "one-three-one-rule": "Regra 1-3-1 (comunicação)",
  qmd: "Notas QMD / research",
  "3-statement-model": "Modelo financeiro 3 statements",
  "dcf-model": "Modelo DCF",
  "comps-analysis": "Análise de comparáveis",
  "webapp-testing": "Testar web apps",
  "web-artifacts-builder": "Artefactos web",
  "mcp-builder": "Construir servidores MCP",
  "code-wiki": "Wiki do código",
  "rest-graphql-debug": "Debug REST/GraphQL",
  "subagent-driven-development": "Dev com subagentes",
  "docker-management": "Docker",
  // Research
  "web-research-competitive-intelligence": "Pesquisa de concorrência",
  arxiv: "Artigos científicos (arXiv)",
  "research-paper-writing": "Escrever artigos científicos",
  polymarket: "Mercados de previsão (Polymarket)",
  // Mídia
  "youtube-content": "Conteúdo do YouTube",
};

function isPt(locale: string): boolean {
  return locale.toLowerCase().startsWith("pt");
}

/** True when a friendly pt-BR title exists for this skill and locale. */
export function hasCuratedSkillName(name: string, locale: string): boolean {
  return isPt(locale) && name in PT_DISPLAY;
}

/** Friendly display title for a skill — curated pt-BR name or the original. */
export function skillDisplayName(name: string, locale: string): string {
  if (isPt(locale)) return PT_DISPLAY[name] ?? name;
  return name;
}
