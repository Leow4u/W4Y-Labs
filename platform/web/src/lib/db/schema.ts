import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  uuid,
  serial,
  index,
} from "drizzle-orm/pg-core";

// Registry da plataforma (docs/ARQUITETURA.md §4.2) — versão M0/v0.
// tenant_id/user_email vêm do dev-auth por enquanto; Identity Platform depois.

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    userEmail: text("user_email").notNull(),
    agentId: uuid("agent_id"),
    // IDs do lado do Wayne (instância Cloud Run)
    wayneRunId: text("wayne_run_id").notNull().unique(),
    wayneSessionId: text("wayne_session_id").notNull(),
    status: text("status").notNull().default("queued"), // queued|running|waiting_for_approval|completed|failed|stopped
    inputText: text("input_text").notNull(),
    outputText: text("output_text"),
    errorText: text("error_text"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    // custo estimado (USD) a partir dos tokens × preço por modelo (aproximação)
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("runs_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

// Timeline da run — tudo que não é delta de texto (tool.started/completed,
// approval.request, run.completed, run.failed...). Alimenta Observabilidade.
export const runEvents = pgTable(
  "run_events",
  {
    id: serial("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("run_events_run_idx").on(t.runId)],
);

// Mensagens principais (input do usuário + resposta final do assistente).
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_run_idx").on(t.runId)],
);

// Registry de instâncias Wayne (casca fina) — cada tenant tem 1+ instâncias
// (serviços Cloud Run servindo o dashboard Work4You). A plataforma lista,
// sonda a saúde e roteia o usuário para a instância do seu tenant.
export const instances = pgTable(
  "instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(), // base URL do serviço Cloud Run (dashboard na 8080)
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("instances_tenant_idx").on(t.tenantId)],
);

// Agent Studio v0 — definição de agente (nome + instruções + modelo).
// Usado como `instructions` no POST /v1/runs quando selecionado no chat.
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  instructions: text("instructions").notNull(),
  model: text("model"), // model-route alias opcional; null = default da instância
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Artefatos v0 — tabela criada desde já; o coletor chega em fase futura.
export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  gcsUri: text("gcs_uri"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
