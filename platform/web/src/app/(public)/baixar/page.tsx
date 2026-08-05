import Link from "next/link";
import { appUrl, platformUrl } from "@/lib/site-origins";

// Download page: desktop app + browser entry (first-class peers).

const WINDOWS_DOWNLOAD_URL =
  "https://storage.googleapis.com/w4y-engine-dist/Work4You-1.0.87-win-x64.exe";
const VERSION = "1.0.87";
const WINDOWS_SIZE = "~104 MB";

const PLATFORMS = [
  {
    name: "Windows",
    detail: "Windows 10 ou 11 · 64 bits",
    sub: `Versão ${VERSION} · ${WINDOWS_SIZE}`,
    url: WINDOWS_DOWNLOAD_URL,
  },
  {
    name: "macOS",
    detail: "Apple Silicon e Intel",
    sub: "Em breve",
    url: "",
  },
  {
    name: "Linux",
    detail: "AppImage",
    sub: "Em breve",
    url: "",
  },
];

const BENEFITS = [
  {
    title: "Uma janela só sua",
    copy: "O Work4You abre no seu computador como um aplicativo — ícone na barra, atalho de teclado e notificações.",
  },
  {
    title: "Atualizações dentro do app",
    copy: "Instale uma vez. Quando uma nova versão sair, um chip aparece na barra lateral e atualiza com um clique — sem precisar voltar ao site.",
  },
  {
    title: "Entre com a sua conta",
    copy: "O mesmo login do site. Suas conversas, agentes e conectores já estão lá quando você abre.",
  },
];

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-brand text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
      {children}
    </p>
  );
}

export default function DownloadPage() {
  const browserHref = platformUrl("/login?next=/login/enter");
  const browserDirect = appUrl("/chat");

  return (
    <>
      <section className="px-6 pb-16 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-brand text-sm font-medium text-neutral-500">
            Work4You para computador ou navegador
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-neutral-900 md:text-5xl">
            O seu funcionário digital, onde preferir
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-500">
            Instale o app nativo no Windows ou abra no navegador — a mesma
            experiência, a mesma conta, agentes na nuvem.
          </p>
        </div>

        <div className="mx-auto mt-10 flex max-w-lg flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          {WINDOWS_DOWNLOAD_URL ? (
            <a
              href={WINDOWS_DOWNLOAD_URL}
              className="font-brand inline-flex items-center justify-center rounded-full bg-neutral-900 px-8 py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-700"
            >
              Baixar para Windows
            </a>
          ) : (
            <span className="font-brand inline-flex cursor-default items-center justify-center rounded-full bg-neutral-100 px-8 py-3.5 text-base font-medium text-neutral-400">
              Windows — em breve
            </span>
          )}
          <Link
            href={browserHref}
            className="font-brand inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-8 py-3.5 text-base font-medium text-neutral-800 transition-colors hover:border-neutral-400"
          >
            Abrir no navegador
          </Link>
        </div>
        <p className="mx-auto mt-3 max-w-md text-center text-sm text-neutral-500">
          Já entrou?{" "}
          <a
            href={browserDirect}
            className="font-medium text-neutral-700 underline-offset-4 hover:underline"
          >
            Ir para {browserDirect.replace(/^https?:\/\//, "")}
          </a>
        </p>
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionKicker>O app para computador</SectionKicker>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            A mesma Work4You, num aplicativo nativo
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-neutral-200 bg-white p-7"
              >
                <h3 className="text-lg font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  {b.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionKicker>Baixar</SectionKicker>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Escolha o seu sistema
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                className="flex flex-col justify-between rounded-2xl border border-neutral-200 p-7"
              >
                <div>
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-neutral-500">{p.detail}</p>
                  <p className="mt-1 text-xs text-neutral-400">{p.sub}</p>
                </div>
                <div className="mt-6">
                  {p.url ? (
                    <a
                      href={p.url}
                      className="font-brand inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
                    >
                      Baixar
                    </a>
                  ) : (
                    <span className="font-brand inline-flex cursor-default items-center justify-center rounded-full bg-neutral-100 px-5 py-2 text-sm font-medium text-neutral-400">
                      Em breve
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Conectar pelo terminal</h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-500">
                  Uma forma leve de falar com os seus agentes direto da linha de
                  comando, conectada à sua conta na nuvem.
                </p>
              </div>
              <span className="font-brand shrink-0 rounded-full bg-neutral-100 px-4 py-1.5 text-xs font-medium text-neutral-400">
                Em breve
              </span>
            </div>
          </div>

          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-neutral-400">
            Na primeira instalação, o Windows pode pedir confirmação extra
            (&quot;Mais informações&quot; → &quot;Executar assim mesmo&quot;). Isso desaparece
            com o certificado de assinatura. Após instalar, as atualizações chegam
            direto pelo app — sem baixar novamente.
          </p>
        </div>
      </section>
    </>
  );
}
