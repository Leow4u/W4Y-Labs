import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDevSession } from "@/lib/dev-auth";
import { db, runs, instances } from "@/lib/db";
import { probeInstance, type InstanceHealth } from "@/lib/instance-health";

export const dynamic = "force-dynamic";

// Console Admin (visão da PLATAFORMA, cross-tenant) — restrito a operadores
// W4Y (role=admin). Tenants/usuários derivados do registry em v0; a tabela
// formal de tenants chega com o Identity Platform.

interface TenantRow {
  tenant_id: string;
  users: number;
  total_runs: number;
  failed_runs: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  last_activity: Date | null;
}

interface InstanceRow {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  health: InstanceHealth;
}

const money = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const num = (v: number) => v.toLocaleString("pt-BR");

export default async function AdminPage() {
  const session = await getDevSession();
  if (!session || session.role !== "admin") notFound();

  // --- Frota de instâncias Wayne (todas, cross-tenant) + saúde ---
  let fleet: InstanceRow[] | null = null;
  try {
    const list = await db().select().from(instances);
    fleet = await Promise.all(
      list.map(async (i) => ({
        id: i.id,
        tenantId: i.tenantId,
        name: i.name,
        url: i.url,
        health: await probeInstance(i.url),
      })),
    );
  } catch {
    fleet = null;
  }

  // --- Agregados cross-tenant do registry ---
  let tenants: TenantRow[] | null = null;
  let totals = { tenants: 0, users: 0, runs: 0, cost: 0 };
  try {
    const rows = await db()
      .select({
        tenant_id: runs.tenantId,
        users: sql<number>`count(distinct ${runs.userEmail})::int`,
        total_runs: sql<number>`count(*)::int`,
        failed_runs: sql<number>`count(*) filter (where ${runs.status} in ('failed','stopped'))::int`,
        input_tokens: sql<number>`coalesce(sum(${runs.inputTokens}),0)::bigint`,
        output_tokens: sql<number>`coalesce(sum(${runs.outputTokens}),0)::bigint`,
        cost_usd: sql<number>`coalesce(sum(${runs.estimatedCostUsd}),0)::float8`,
        last_activity: sql<Date | null>`max(${runs.createdAt})`,
      })
      .from(runs)
      .groupBy(runs.tenantId)
      .orderBy(sql`max(${runs.createdAt}) desc`);

    tenants = rows.map((r) => ({
      ...r,
      input_tokens: Number(r.input_tokens),
      output_tokens: Number(r.output_tokens),
      cost_usd: Number(r.cost_usd),
      last_activity: r.last_activity ? new Date(r.last_activity) : null,
    }));
    totals = {
      tenants: tenants.length,
      users: tenants.reduce((a, t) => a + t.users, 0),
      runs: tenants.reduce((a, t) => a + t.total_runs, 0),
      cost: tenants.reduce((a, t) => a + t.cost_usd, 0),
    };
  } catch {
    tenants = null;
  }

  const dateFmt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-xl font-semibold">Admin</h1>
          <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
            visão da plataforma
          </span>
        </div>
        <p className="mb-6 text-sm text-neutral-500">
          Todos os tenants e usuários — escala-alvo: 2.000 usuários. v0 derivado do registry;
          gestão de tenants chega com o Identity Platform.
        </p>

        {/* Frota de instâncias (cross-tenant) */}
        <h2 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">
          Instâncias (todas)
        </h2>
        {fleet === null ? (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Registry indisponível — não foi possível listar as instâncias.
          </div>
        ) : fleet.length === 0 ? (
          <div className="mb-6 rounded-lg border border-dashed border-neutral-300 p-5 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Nenhuma instância registrada.
          </div>
        ) : (
          <div className="mb-2 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2.5">Tenant</th>
                  <th className="px-4 py-2.5">Instância</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Latência</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {fleet.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">{i.tenantId}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-brand">{i.name}</span>
                      <span className="block truncate text-xs text-neutral-400">{i.url}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {i.health.healthy ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                          ● online
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                          ● offline
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-neutral-500">
                      {i.health.latencyMs !== null ? `${i.health.latencyMs} ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={i.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-neutral-500 underline-offset-2 hover:underline"
                      >
                        abrir →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mb-6 text-xs text-neutral-400">
          M0: instância compartilhada de desenvolvimento registrada manualmente. Fase 2:
          provisionamento automático por tenant (orchestrator) — ver ARQUITETURA §4.
        </p>

        {/* Totais */}
        <h2 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">
          Plataforma
        </h2>
        {tenants === null ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Registry indisponível — verifique o Cloud SQL Auth Proxy / DATABASE_URL.
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: "Tenants", value: num(totals.tenants) },
                { label: "Usuários ativos", value: num(totals.users) },
                { label: "Runs", value: num(totals.runs) },
                { label: "Custo estimado", value: money(totals.cost) },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <p className="text-xs text-neutral-500">{c.label}</p>
                  <p className="mt-1 text-xl font-semibold">{c.value}</p>
                </div>
              ))}
            </div>

            {/* Por tenant */}
            <h2 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">
              Por tenant
            </h2>
            {tenants.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
                Nenhuma atividade registrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                    <tr>
                      <th className="px-4 py-2.5">Tenant</th>
                      <th className="px-4 py-2.5 text-right">Usuários</th>
                      <th className="px-4 py-2.5 text-right">Runs</th>
                      <th className="px-4 py-2.5 text-right">Falhas</th>
                      <th className="px-4 py-2.5 text-right">Tokens (in/out)</th>
                      <th className="px-4 py-2.5 text-right">Custo</th>
                      <th className="px-4 py-2.5">Última atividade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {tenants.map((t) => (
                      <tr key={t.tenant_id}>
                        <td className="px-4 py-2.5 font-mono text-xs">{t.tenant_id}</td>
                        <td className="px-4 py-2.5 text-right">{num(t.users)}</td>
                        <td className="px-4 py-2.5 text-right">{num(t.total_runs)}</td>
                        <td className={`px-4 py-2.5 text-right ${t.failed_runs > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {num(t.failed_runs)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          {num(t.input_tokens)} / {num(t.output_tokens)}
                        </td>
                        <td className="px-4 py-2.5 text-right">{money(t.cost_usd)}</td>
                        <td className="px-4 py-2.5 text-xs text-neutral-500">
                          {t.last_activity ? dateFmt.format(t.last_activity) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
