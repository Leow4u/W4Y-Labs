import { eq } from "drizzle-orm";
import { getDevSession } from "@/lib/dev-auth";
import { db, instances } from "@/lib/db";
import { probeInstance, type InstanceHealth } from "@/lib/instance-health";

export const dynamic = "force-dynamic";

// Casca fina — tenant router: lista as instâncias Wayne do TENANT do usuário,
// sonda a saúde de cada uma e dá o botão de entrada via SSO. O trabalho de
// verdade (chat, files, cron, skills...) acontece no Wayne, servido na mesma
// origem Work4You pelo Load Balancer.

interface Row {
  id: string;
  name: string;
  url: string;
  notes: string | null;
  createdAt: Date;
  health: InstanceHealth;
}

export default async function InstanciasPage() {
  const session = (await getDevSession())!; // layout (app) garante auth

  let rows: Row[] | null = null;
  try {
    const list = await db()
      .select()
      .from(instances)
      .where(eq(instances.tenantId, session.tenantId));
    rows = await Promise.all(
      list.map(async (i) => ({ ...i, health: await probeInstance(i.url) })),
    );
  } catch {
    rows = null;
  }

  const dateFmt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-xl font-semibold">Instâncias</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-500">
          Seu workspace Work4You — a instância dedicada do seu tenant, acessada
          pelo domínio único work4you.ai.
        </p>

        {rows === null ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Registry indisponível — verifique o Cloud SQL Auth Proxy / DATABASE_URL.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Nenhuma instância provisionada para o seu tenant ainda. Por enquanto,
            instâncias são registradas pelo administrador.
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((i) => (
              <div
                key={i.id}
                className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <p className="font-brand font-semibold">{i.name}</p>
                      {i.health.healthy ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                          ● online{i.health.latencyMs !== null ? ` · ${i.health.latencyMs} ms` : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                          ● offline
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-500">{i.url}</p>
                    {i.notes && (
                      <p className="mt-1 text-xs text-neutral-400">{i.notes}</p>
                    )}
                    <p className="mt-1 text-[11px] text-neutral-400">
                      registrada em {dateFmt.format(i.createdAt)}
                    </p>
                  </div>
                  <a
                    href="/login/enter"
                    className="font-brand shrink-0 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-neutral-900"
                  >
                    Entrar no Work4You →
                  </a>
                </div>
              </div>
            ))}
            <p className="text-xs text-neutral-400">
              A entrada usa login unificado e abre o Work4You em /chat na mesma origem.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
