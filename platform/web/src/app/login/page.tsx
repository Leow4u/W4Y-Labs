import { loginAction } from "./actions";

const ERRORS: Record<string, string> = {
  denied: "Acesso ainda não liberado para este e-mail.",
  empty: "Informe seu e-mail.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const errorMsg = error ? ERRORS[error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div className="text-center">
        {/* Logo Work4You — a palavra em Cascadia Mono (branding W4Y). */}
        <h1 className="font-brand text-2xl font-semibold">Work4You</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Entre para acessar o seu funcionário digital.
        </p>
      </div>
      <form action={loginAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? ""} />
        <input
          name="email"
          type="email"
          required
          placeholder="voce@empresa.com"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        {errorMsg && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {errorMsg}
          </p>
        )}
        <button
          type="submit"
          className="font-brand rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900"
        >
          Entrar
        </button>
      </form>
      <p className="text-center font-brand text-[10px] tracking-wider text-neutral-400">
        W4Y-Labs
      </p>
    </main>
  );
}
