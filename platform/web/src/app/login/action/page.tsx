import { Suspense } from "react";
import ActionClient from "./ActionClient";

export const dynamic = "force-dynamic";

export default function LoginActionPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 px-4 py-16">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-mata">Work4You</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Confirmacao de conta</h1>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-soft">A carregar…</p>}>
        <ActionClient />
      </Suspense>
    </main>
  );
}