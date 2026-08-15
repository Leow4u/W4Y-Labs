import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDevSession } from "@/lib/dev-auth";
import LoginClient from "./LoginClient";

// Work4You single door (Claude-style split): form column on the left, living
// forest video on the right. Auth mechanics are untouched — Firebase in the
// browser, session born at /login/verify, then SSO → /chat.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; return_to?: string }>;
}) {
  const { next, return_to } = await searchParams;
  const dest = (next ?? return_to ?? "").trim();

  // Desktop hand-off: sessão já válida → saltar o formulário e ir para /device.
  if (dest === "/device") {
    const session = await getDevSession();
    if (session) {
      redirect("/device");
    }
  }

  return (
    <main className="flex min-h-screen bg-paper text-ink">
      {/* ── Left: the door ─────────────────────────────────────────── */}
      <div className="flex w-full flex-1 flex-col px-6 py-6 lg:px-12">
        <Link href="/" className="inline-flex w-fit items-center">
          <Image
            src="/brand/work4you-logo.png"
            alt="Work4You"
            width={2400}
            height={244}
            priority
            className="h-[17px] w-auto"
          />
        </Link>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-12">
          <div className="text-center">
            <h1 className="text-[2.5rem] font-extrabold leading-[1.08] tracking-[-0.025em] text-ink [text-wrap:balance] xl:text-[2.9rem]">
              O novo jeito de trabalhar.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">
              Seu parceiro de trabalho para grandes resultados.
            </p>
          </div>

          <LoginClient
            next={dest}
            turnstileSitekey={process.env.TURNSTILE_SITEKEY || undefined}
          />

          <footer className="text-center text-[11px] leading-relaxed text-ink-faint">
            <p>
              Ao continuar, você concorda com os nossos{" "}
              <Link href="/termos" className="underline underline-offset-2 hover:text-ink">
                Termos e Serviços
              </Link>{" "}
              e leu a nossa{" "}
              <Link href="/privacidade" className="underline underline-offset-2 hover:text-ink">
                Política de Privacidade
              </Link>
              .
            </p>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em]">
              © 2026 W4Y-Labs
            </p>
          </footer>
        </div>
      </div>

      {/* ── Right: floating media card, Claude-style — air around it,
             ~4:5, vertically centered. Swap the Image for a <video> when
             a custom clip lands in public/media. ───────────────────────── */}
      <div className="hidden shrink-0 items-center justify-center px-10 py-12 lg:flex lg:w-[45%]">
        <div className="relative aspect-[4/5] max-h-[80vh] w-full max-w-[540px] overflow-hidden rounded-3xl">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src="/media/login.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0 bg-mata-deep/10" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-mata-deep/70 to-transparent px-8 pb-7 pt-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/90">
              Entre · Personalize · Trabalhe
            </p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-paper/75">
              Agente de IA que executa de verdade — terminal, canais e nuvem, com
              o mesmo Work em todo o lado.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
