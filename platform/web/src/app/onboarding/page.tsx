import { redirect } from "next/navigation";
import { getDevSession } from "@/lib/dev-auth";
import OnboardingClient from "./OnboardingClient";
import { postLoginDestination } from "@/lib/shared-motor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparando sua conta — Work4You" };

// Primeira vez (Free): a instância Fly do tenant ainda está sendo criada.
// Ao ficar 'ready', redireciona para o app via /login/enter.
export default async function OnboardingPage() {
  const session = await getDevSession();
  if (!session) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" />
      <div className="w-full">
        <h1 className="font-brand text-2xl font-semibold">Preparando sua conta</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Estamos montando seu espaço dedicado na nuvem — memória, arquivos e ferramentas
          só seus. Isso acontece uma vez; depois você entra direto no Work4You.
        </p>
      </div>
      <OnboardingClient readyHref={postLoginDestination()} />
      <p className="font-brand text-[10px] tracking-wider text-neutral-400">Work4You</p>
    </main>
  );
}
