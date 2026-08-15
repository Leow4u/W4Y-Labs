import Link from "next/link";
import { redirect } from "next/navigation";
import { getCheckoutSessionStatus } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinatura — Work4You" };

// Retorno do checkout embedded (return_url). A ativação real acontece pelo
// webhook (checkout.session.completed); aqui só confirmamos o status e
// encaminhamos o usuário. Idempotente e à prova de falha da API da Stripe.
export default async function RetornoPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/planos");

  let complete = false;
  try {
    const st = await getCheckoutSessionStatus(session_id);
    complete = st.status === "complete";
  } catch {
    /* API da Stripe indisponível — cai no estado "processando" abaixo */
  }
  if (complete) redirect("/instancias?assinatura=ok");

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <h1 className="font-brand text-2xl font-semibold">Estamos ativando sua assinatura…</h1>
      <p className="mt-3 text-sm text-neutral-500">
        Pode levar alguns segundos para o pagamento ser confirmado. Você já pode voltar às suas
        instâncias — o plano fica ativo assim que a confirmação chega.
      </p>
      <Link
        href="/instancias"
        className="font-brand mt-6 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-85 dark:bg-white dark:text-neutral-900"
      >
        Ir para minhas instâncias
      </Link>
    </main>
  );
}
