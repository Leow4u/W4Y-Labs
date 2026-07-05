import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDevSession } from "@/lib/dev-auth";
import { db } from "@/lib/db";
import { PLANS, type Plan } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planos — Work4You" };

const ORDER: Plan[] = ["free", "plus", "super", "ultra"];

export default async function PlanosPage({
  searchParams,
}: {
  searchParams: Promise<{ assinatura?: string; erro?: string }>;
}) {
  const session = await getDevSession();
  if (!session) redirect("/login?next=/planos");
  const { erro } = await searchParams;

  let atual = { plan: "free", status: "inactive", credits: "0" };
  try {
    const r = await db().execute<{ plan: string; status: string; monthly_credits_usd: string | null }>(
      sql`SELECT plan, status, monthly_credits_usd FROM billing WHERE tenant_id=${session.tenantId}`,
    );
    if (r.rows[0]) {
      atual = { plan: r.rows[0].plan, status: r.rows[0].status, credits: r.rows[0].monthly_credits_usd ?? "0" };
    }
  } catch {
    /* tabela ainda não criada / registry indisponível — mostra Free */
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <div className="text-center">
        <h1 className="font-brand text-3xl font-semibold">Planos</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-neutral-500">
          Todos os planos pagos incluem créditos mensais para usar o Wayne Agent com modelos de ponta.
          Plano atual:{" "}
          <strong className="font-brand uppercase">{atual.plan}</strong>
          {atual.status === "active" && " · ativo"}.
        </p>
        {erro === "stripe" && (
          <p className="mt-3 text-sm text-red-600">Não foi possível iniciar o pagamento. Tente novamente.</p>
        )}
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-4">
        {ORDER.map((key) => {
          const p = PLANS[key];
          const ativo = atual.plan === key && atual.status === "active";
          const destaque = key === "super";
          return (
            <div
              key={key}
              className={`flex flex-col rounded-2xl border p-6 ${
                destaque ? "border-neutral-900 shadow-[0_16px_50px_-20px_rgba(0,0,0,0.25)]" : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <h2 className="font-brand text-lg font-semibold">{p.label}</h2>
              <p className="mt-1 text-2xl font-semibold">
                {p.priceBrlMonth === 0 ? "R$ 0" : `R$ ${p.priceBrlMonth}`}
                <span className="text-sm font-normal text-neutral-500">/mês</span>
              </p>
              <p className="mt-3 flex-1 text-sm text-neutral-500">
                {p.creditsUsd === 0 ? "Sem créditos mensais." : `US$ ${p.creditsUsd} em créditos por mês${p.rolloverUsd ? ` · rollover até US$ ${p.rolloverUsd}` : ""}.`}
              </p>
              {key === "free" ? (
                <span className="mt-5 rounded-full bg-neutral-100 px-4 py-2 text-center text-sm text-neutral-500 dark:bg-neutral-800">
                  Incluído
                </span>
              ) : ativo ? (
                <span className="mt-5 rounded-full bg-emerald-100 px-4 py-2 text-center text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  Plano atual
                </span>
              ) : (
                <form action="/planos/checkout" method="post" className="mt-5">
                  <input type="hidden" name="plan" value={key} />
                  <button
                    type="submit"
                    className={`font-brand w-full rounded-full px-4 py-2 text-sm font-semibold ${
                      destaque ? "bg-neutral-900 text-white hover:opacity-85 dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100"
                    }`}
                  >
                    Assinar via Stripe
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-neutral-400">
        Pagamento processado com segurança pela Stripe. Você pode cancelar quando quiser.{" "}
        <Link href="/instancias" className="underline">Voltar</Link>
      </p>
    </main>
  );
}
