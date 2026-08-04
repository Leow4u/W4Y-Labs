import Link from "next/link";

// PÃ¡gina de download do App para computador do Work4You. O app Ã© a MESMA
// experiÃªncia da nuvem numa janela nativa â€” nÃ£o instala nada pesado nem roda o
// agente na sua mÃ¡quina (seus dados e o processamento ficam na nuvem, com
// seguranÃ§a). Linguagem pÃºblica, sem jargÃ£o. Windows disponÃ­vel; macOS/Linux e
// o acesso por terminal chegam em seguida.

// TODO(infra): After `npm run dist:win:nsis` + upload to gs://w4y-engine-dist/,
// set WINDOWS_DOWNLOAD_URL to the signed public URL of the NSIS installer exe.
// Format: https://storage.googleapis.com/w4y-engine-dist/Work4You-<version>-win-x64.exe
// Vazio ("") â†’ o botÃ£o aparece como "Em breve" (seguro para deploy antecipado).
const WINDOWS_DOWNLOAD_URL = "https://storage.googleapis.com/w4y-engine-dist/Work4You-1.0.73-win-x64.exe";
const VERSION = "1.0.73";
const WINDOWS_SIZE = "~104 MB";

const PLATFORMS = [
  {
    name: "Windows",
    detail: "Windows 10 ou 11 Â· 64 bits",
    sub: `VersÃ£o ${VERSION} Â· ${WINDOWS_SIZE}`,
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
    title: "Uma janela sÃ³ sua",
    copy: "O Work4You abre no seu computador como um aplicativo â€” Ã­cone na barra, atalho de teclado e notificaÃ§Ãµes.",
  },
  {
    title: "AtualizaÃ§Ãµes dentro do app",
    copy: "Instale uma vez. Quando uma nova versÃ£o sair, um chip aparece na barra lateral e atualiza com um clique â€” sem precisar voltar ao site.",
  },
  {
    title: "Entre com a sua conta",
    copy: "O mesmo login do site. Suas conversas, agentes e conectores jÃ¡ estÃ£o lÃ¡ quando vocÃª abre.",
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
      {/* â”€â”€ Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="px-6 pb-16 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-brand text-sm font-medium text-neutral-500">
            Work4You para computador
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-neutral-900 md:text-5xl">
            O seu funcionÃ¡rio digital na sua Ã¡rea de trabalho
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-500">
            Instale uma vez e o app cuida do resto â€” incluindo atualizaÃ§Ãµes
            automÃ¡ticas, direto da janela. Com Ã­cone prÃ³prio, atalho de teclado
            e notificaÃ§Ãµes.
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
              Windows â€” em breve
            </span>
          )}
          <p className="mt-3 text-sm text-neutral-500">
            VersÃ£o {VERSION} Â· {WINDOWS_SIZE} Â· Windows 10/11 (64 bits)
          </p>
        </div>
      </section>

      {/* â”€â”€ Por que usar o app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {/* â”€â”€ Escolha a plataforma â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

          {/* Conectar pelo terminal â€” em breve (cliente fino da nuvem; NÃƒO o
              instalador local, que rodaria o agente na mÃ¡quina). */}
          <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Conectar pelo terminal</h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-500">
                  Uma forma leve de falar com os seus agentes direto da linha de
                  comando, conectada Ã  sua conta na nuvem.
                </p>
              </div>
              <span className="font-brand shrink-0 rounded-full bg-neutral-100 px-4 py-1.5 text-xs font-medium text-neutral-400">
                Em breve
              </span>
            </div>
          </div>

          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-neutral-400">
            Na primeira instalaÃ§Ã£o, o Windows pode pedir confirmaÃ§Ã£o extra
            (â€œMais informaÃ§Ãµesâ€ â†’ â€œExecutar assim mesmoâ€). Isso desaparece
            com o certificado de assinatura. ApÃ³s instalar, as
            atualizaÃ§Ãµes chegam direto pelo app â€” sem baixar novamente.
          </p>

          <p className="mt-6 text-sm text-neutral-500">
            Prefere usar no navegador?{" "}
            <Link
              href="/login"
              className="font-medium text-neutral-700 underline-offset-4 hover:underline"
            >
              Abrir o Work4You no navegador â†’
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
