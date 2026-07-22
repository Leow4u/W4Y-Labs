/** Static fixture data for v1 product mocks (Fase 9 wireframes). */

export const MOCK_SESSIONS = [
  { id: "s1", title: "Pesquisa mercado", active: true },
  { id: "s2", title: "Relatório mensal", active: false },
  { id: "s3", title: "Posts LinkedIn", active: false },
];

export const MOCK_DELIVERABLES = [
  {
    id: "d1",
    name: "Relatório vendas.xlsx",
    kind: "xlsx" as const,
    task: "Pesquisa mercado",
    when: "2h",
  },
  {
    id: "d2",
    name: "Resumo.pdf",
    kind: "pdf" as const,
    task: "Pesquisa mercado",
    when: "2h",
  },
  {
    id: "d3",
    name: "Planilha custos.xlsx",
    kind: "xlsx" as const,
    task: "Relatório mensal",
    when: "Ontem",
  },
];

export const MOCK_CONNECTORS = [
  { name: "Gmail", connected: true },
  { name: "Google Sheets", connected: true },
  { name: "WhatsApp", connected: false },
  { name: "Notion", connected: false },
  { name: "Google Drive", connected: false },
  { name: "Slack", connected: false },
];

export const MOCK_USE_CASES = [
  { title: "Resumir e-mails da semana", app: "Gmail" },
  { title: "Atualizar planilha de vendas", app: "Sheets" },
  { title: "Responder clientes no WhatsApp", app: "WhatsApp" },
  { title: "Organizar notas do projeto", app: "Notion" },
];

export const MOCK_AGENTS = [
  {
    id: "marketing",
    name: "Marketing",
    status: "working" as const,
    statusLabel: "Gerando posts",
    spend: 312,
    cap: 800,
  },
  {
    id: "financeiro",
    name: "Financeiro",
    status: "idle" as const,
    statusLabel: "Ocioso",
    spend: 89,
    cap: 600,
  },
];

export const MOCK_KANBAN = [
  { col: "Pronto", items: ["Briefing Q3"] },
  { col: "Em progresso", items: ["Relatório custos", "Posts LinkedIn"] },
  { col: "Revisão", items: ["Apresentação board"] },
  { col: "Bloqueado", items: [] },
  { col: "Concluído", items: ["Onboarding docs"] },
];

export const MOCK_ROUTINES = [
  {
    id: "r1",
    title: "Social Media",
    schedule: "diário 9h",
    agent: "Marketing",
  },
  {
    id: "r2",
    title: "Fechamento semanal",
    schedule: "sexta 17h",
    agent: "Financeiro",
  },
];

export const MOCK_BLUEPRINTS = [
  { title: "Resumo de e-mails", desc: "Todo dia às 8h" },
  { title: "Relatório de vendas", desc: "Toda segunda" },
  { title: "Alertas WhatsApp", desc: "A cada 2 horas" },
];

export const MOCK_SUBAGENTS = [
  { name: "Analista", status: "running" as const },
  { name: "Redator", status: "idle" as const },
];

export const MOCK_MODELS = [
  { id: "gemini", label: "Gemini 2.5", on: true },
  { id: "claude", label: "Claude Sonnet", on: true },
  { id: "gpt", label: "GPT-4.1", on: false },
  { id: "deepseek", label: "DeepSeek V3", on: true },
];

export const MOCK_CONFIG_SECTIONS = [
  "Conta",
  "Geral",
  "Aparência",
  "Plano e uso",
  "Modelos",
  "Memória",
  "Privacidade",
  "Notificações",
  "Computador",
  "Recursos",
  "Segurança",
  "Regras e atalhos",
  "Navegador",
  "Hooks",
  "Avançado",
];
