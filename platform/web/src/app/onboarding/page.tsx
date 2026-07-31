import { redirect } from "next/navigation";
import { getDevSession } from "@/lib/dev-auth";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparando — Work4You" };

// Tela de preparação do NOVO tenant Free. Não é uma casca escondendo o
// Wayne — a instância do tenant literalmente ainda está sendo criada no Fly
// (app + volume + máquina, ~1-2 min). Ao ficar 'ready', entra no Wayne.
export default async function OnboardingPage() {
  const session = await getDevSession();
  if (!session) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" />
      <div>
        <h1 className="font-brand text-2xl font-semibold">Preparando o seu funcionário digital</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Estamos criando a sua instância dedicada do Work4You na nuvem — memória, arquivos e
          ferramentas só suas. Leva cerca de um minuto.
        </p>
      </div>
      <OnboardingClient />
      <p className="font-brand text-[10px] tracking-wider text-neutral-400">W4Y-Labs</p>
    </main>
  );
}
