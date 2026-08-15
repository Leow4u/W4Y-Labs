import Link from "next/link";

import {
  MACOS_DESKTOP_VERSION,
  INSTALL_CMD,
  MACOS_DESKTOP_AVAILABLE,
  MACOS_DESKTOP_SIGNED,
  MACOS_DESKTOP_URL,
} from "@/lib/product-download";
import { getSiteLocale } from "@/lib/site-locale";

const COPY = {
  pt: {
    titleReady: "Instalar Work4You no macOS",
    bodyReady:
      "Apple Silicon (M1/M2/M3/M4). O instalador ainda não tem assinatura Apple — o macOS pode avisar na primeira abertura.",
    gatekeeperTitle: "Se o macOS bloquear",
    gatekeeperSteps: [
      "Abra o .dmg e arraste Work4You para Aplicações.",
      "Na primeira abertura: clique direito em Work4You → Abrir → Abrir de novo.",
      "Ou: Ajustes do Sistema → Privacidade e Segurança → Abrir mesmo assim.",
    ],
    download: "Descarregar .dmg",
    terminal: "Preferir terminal (CLI)",
    back: "Voltar ao início",
    noteSigned: `v${MACOS_DESKTOP_VERSION} · assinado e notarizado`,
    noteUnsigned: `v${MACOS_DESKTOP_VERSION} · pré-lançamento (sem assinatura Apple ainda)`,
    titlePending: "App desktop para macOS",
    bodyPending:
      "O instalador nativo está a ser publicado. Enquanto isso, use a linha de comando — o mesmo motor e a mesma conta.",
    notePending: `Versão desktop ${MACOS_DESKTOP_VERSION} · macOS arm64 em publicação`,
  },
  en: {
    titleReady: "Install Work4You on macOS",
    bodyReady:
      "Apple Silicon (M1/M2/M3/M4). The installer is not Apple-notarized yet — macOS may warn on first open.",
    gatekeeperTitle: "If macOS blocks the app",
    gatekeeperSteps: [
      "Open the .dmg and drag Work4You to Applications.",
      "First launch: right-click Work4You → Open → Open again.",
      "Or: System Settings → Privacy & Security → Open Anyway.",
    ],
    download: "Download .dmg",
    terminal: "Prefer terminal (CLI)",
    back: "Back to home",
    noteSigned: `v${MACOS_DESKTOP_VERSION} · signed and notarized`,
    noteUnsigned: `v${MACOS_DESKTOP_VERSION} · pre-release (Apple signing pending)`,
    titlePending: "Desktop app for macOS",
    bodyPending:
      "The native installer is being published. For now, use the CLI — same engine, same account.",
    notePending: `Desktop ${MACOS_DESKTOP_VERSION} · macOS arm64 release in progress`,
  },
} as const;

export default async function MacDesktopPage() {
  const locale = await getSiteLocale();
  const t = COPY[locale];

  if (!MACOS_DESKTOP_AVAILABLE) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t.titlePending}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{t.bodyPending}</p>
        <p className="mt-2 font-mono text-[11px] text-ink-faint">{t.notePending}</p>
        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-white px-4 py-3.5">
          <code className="block break-all font-mono text-[12.5px] leading-relaxed text-mata">
            {INSTALL_CMD.unix}
          </code>
        </div>
        <div className="mt-8 flex flex-wrap gap-4 text-[14px] font-semibold">
          <Link href="/#install-terminal" className="text-mata hover:underline">
            {t.terminal}
          </Link>
          <Link href="/" className="text-ink-soft hover:text-ink">
            {t.back}
          </Link>
        </div>
      </main>
    );
  }

  const note = MACOS_DESKTOP_SIGNED ? t.noteSigned : t.noteUnsigned;

  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{t.titleReady}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{t.bodyReady}</p>
      <p className="mt-2 font-mono text-[11px] text-ink-faint">{note}</p>
      <a
        href={MACOS_DESKTOP_URL}
        className="mt-8 inline-flex items-center justify-center rounded-full bg-ink px-6 py-3.5 text-[15px] font-semibold text-paper transition-colors hover:bg-black"
      >
        {t.download}
      </a>
      <div className="mt-10 rounded-xl border border-line bg-paper p-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {t.gatekeeperTitle}
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-ink-soft">
          {t.gatekeeperSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="mt-8 flex flex-wrap gap-4 text-[14px] font-semibold">
        <Link href="/#install-terminal" className="text-ink-soft hover:text-ink">
          {t.terminal}
        </Link>
        <Link href="/" className="text-ink-soft hover:text-ink">
          {t.back}
        </Link>
      </div>
    </main>
  );
}
