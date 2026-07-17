import Link from "next/link";

// Página de download do App para computador do Work4You. O app é a MESMA
// experiência da nuvem numa janela nativa — não instala nada pesado nem roda o
// agente na sua máquina (seus dados e o processamento ficam na nuvem, com
// segurança). Linguagem pública, sem jargão. Windows disponível; macOS/Linux e
// o acesso por terminal chegam em seguida.

// Wire a URL pública real do instalador aqui quando a hospedagem for definida.
// Vazio ("") => o botão aparece como "Em breve" (a página é deployável com
// segurança mesmo antes de publicarmos o arquivo).
const WINDOWS_DOWNLOAD_URL = "";
const VERSION = "0.1.0";
const WINDOWS_SIZE = "79 MB";

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
    title: "Seus dados na nuvem",
    copy: "Nada pesado é instalado e o trabalho continua rodando na nuvem, com segurança — mesmo com o app fechado.",
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
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="px-6 pb-16 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-brand text-sm font-medium text-neutral-500">
            Work4You para computador
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-neutral-900 md:text-5xl">
            O seu funcionário digital na sua área de trabalho
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-500">
            Baixe o app e tenha o Work4You a um clique — com ícone próprio,
            atalho de teclado e notificações. O mesmo lugar, agora numa janela
            sua.
          </p>
        </div>

        {/* Download principal */}
        <div className="mx-auto mt-10 flex max-w-md flex-col items-center">
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
          <p className="mt-3 text-sm text-neutral-500">
            Versão {VERSION} · {WINDOWS_SIZE} · Windows 10/11 (64 bits)
          </p>
        </div>
      </section>

      {/* ── Por que usar o app ────────────────────────────────────────── */}
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

      {/* ── Escolha a plataforma ──────────────────────────────────────── */}
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

          {/* Conectar pelo terminal — em breve (cliente fino da nuvem; NÃO o
              instalador local, que rodaria o agente na máquina). */}
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
            O app ainda está em fase inicial: ao instalar, o Windows pode pedir
            uma confirmação extra (“Mais informações” → “Executar assim mesmo”).
            Isso deixa de aparecer quando publicarmos a versão assinada.
          </p>

          <p className="mt-6 text-sm text-neutral-500">
            Prefere usar no navegador?{" "}
            <Link
              href="/login"
              className="font-medium text-neutral-700 underline-offset-4 hover:underline"
            >
              Abrir o Work4You no navegador →
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
