import { sql } from "drizzle-orm";
import { getDevSession } from "@/lib/dev-auth";
import { db } from "@/lib/db";
import {
  PLANS,
  TEAM_SEAT_USD_MONTH,
  type BillingInterval,
  type Plan,
} from "@/lib/billing";
import { PlansView, type PlanCard } from "./PlansView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assine — Work4You" };

// Planos individuais mostrados (Free é o baseline; os pagos vão nos cards).
const ORDER = ["starter", "pro", "max"] as const;

const USAGE_TAGLINE: Record<(typeof ORDER)[number], string> = {
  starter: "US$ 20 de uso incluído / ciclo",
  pro: "US$ 70 de uso incluído · agente 24/7",
  max: "US$ 400 de uso incluído / ciclo",
};

// Página PÚBLICA de preços (também é o /precos da landing). Deslogado → vê os
// cards e o CTA leva ao cadastro guardando a escolha; logado → checkout embedded.
export default async function PlanosPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const session = await getDevSession();
  const loggedIn = !!session;
  const { plan: planParam, interval: intervalParam } = await searchParams;

  let current = { plan: "free", status: "inactive" };
  if (session) {
    try {
      const r = await db().execute<{ plan: string; status: string }>(
        sql`SELECT plan, status FROM billing WHERE tenant_id=${session.tenantId}`,
      );
      if (r.rows[0]) current = { plan: r.rows[0].plan, status: r.rows[0].status };
    } catch {
      /* tabela ainda não criada / registry indisponível — mostra Free */
    }
  }

  const plans: PlanCard[] = ORDER.map((k) => {
    const p = PLANS[k];
    return {
      key: k,
      label: p.label,
      priceMonth: p.priceUsdMonth,
      priceYear: p.priceUsdYear,
      usageTagline: USAGE_TAGLINE[k],
    };
  });

  // Chave pública da Stripe (inlined no bundle). null → checkout desabilitado
  // ("Em breve") até configurá-la no go-live.
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;

  // Intenção de plano vinda do CTA deslogado (?plan=&interval=) — retoma o
  // checkout após o login.
  const initialPlan = (ORDER as readonly string[]).includes(planParam ?? "")
    ? (planParam as Plan)
    : null;
  const initialInterval: BillingInterval | undefined =
    intervalParam === "year" ? "year" : intervalParam === "month" ? "month" : undefined;

  return (
    <PlansView
      plans={plans}
      teamSeatUsd={TEAM_SEAT_USD_MONTH}
      current={current}
      publishableKey={publishableKey}
      loggedIn={loggedIn}
      initialPlan={initialPlan}
      initialInterval={initialInterval}
    />
  );
}
