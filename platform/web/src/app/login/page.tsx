import Link from "next/link";
import LoginClient from "./LoginClient";

// Porta única da Work4You (estilo Manus): social + e-mail via Identity
// Platform. A autenticação acontece no navegador (Firebase Auth); a sessão
// da plataforma só nasce depois que /login/verify valida o ID token no
// servidor (e a allowlist autoriza). Pós-login → SSO → Wayne em /chat.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="text-center">
        {/* Logo Work4You — a palavra em Cascadia Mono (branding W4Y). */}
        <h1 className="font-brand text-3xl font-semibold">Work4You</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Inicie sessão ou registre-se — comece a delegar ao seu funcionário digital.
        </p>
      </div>

      <LoginClient next={next ?? ""} />

      <footer className="text-center text-[11px] leading-relaxed text-neutral-400">
        <p>
          Ao continuar, você concorda com os nossos{" "}
          <Link href="/termos" className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
            Termos e Serviços
          </Link>{" "}
          e leu a nossa{" "}
          <Link href="/privacidade" className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
            Política de Privacidade
          </Link>
          .
        </p>
        <p className="mt-1 font-brand tracking-wider">© 2026 W4Y-Labs</p>
      </footer>
    </main>
  );
}
