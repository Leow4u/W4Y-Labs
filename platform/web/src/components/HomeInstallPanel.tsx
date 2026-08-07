"use client";

import { useCallback, useState } from "react";

import DesktopDownloadLink from "@/components/DesktopDownloadLink";
import {
  DESKTOP_SIZE,
  DESKTOP_VERSION,
  INSTALL_CMD,
} from "@/lib/product-download";
import type { SiteLocale } from "@/lib/site-locale";

const COPY = {
  pt: {
    sectionTitle: "Instale ou abra onde preferir",
    sectionSub:
      "App nativo no Windows e macOS, linha de comando leve, ou o mesmo produto no navegador — uma conta só.",
    desktopKicker: "Instalar app desktop",
    desktopBtn: "Baixar aplicativo para desktop",
    desktopMeta: `Windows & macOS (Apple Silicon) · v${DESKTOP_VERSION} · ${DESKTOP_SIZE}`,
    desktopNote:
      "Detectamos o seu sistema automaticamente. Na primeira instalação, Windows ou macOS podem pedir confirmação extra (instalador ainda sem assinatura da editora). Depois, atualizações chegam pelo chip dentro do app. macOS: clique direito → Abrir se o Gatekeeper bloquear.",
    terminalKicker: "Instalar via terminal",
    tabUnix: "macOS / Linux",
    tabWindows: "Windows",
    copy: "Copiar",
    copied: "Copiado",
  },
  en: {
    sectionTitle: "Install or open where you work",
    sectionSub:
      "Native Windows and macOS app, a light CLI, or the same product in your browser — one account.",
    desktopKicker: "Install desktop app",
    desktopBtn: "Download desktop app",
    desktopMeta: `Windows & macOS (Apple Silicon) · v${DESKTOP_VERSION} · ${DESKTOP_SIZE}`,
    desktopNote:
      "We detect your system automatically. Windows or macOS may ask for an extra confirmation on first install (unsigned publisher for now). Later updates arrive via the in-app chip. macOS: right-click → Open if Gatekeeper blocks.",
    terminalKicker: "Install via terminal",
    tabUnix: "macOS / Linux",
    tabWindows: "Windows",
    copy: "Copy",
    copied: "Copied",
  },
} as const;

function CopyButton({
  value,
  label,
  copiedLabel,
}: {
  value: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers / denied permission.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label={copied ? copiedLabel : label}
      className="shrink-0 rounded-md p-2 text-ink-faint transition-colors hover:bg-paper hover:text-ink"
    >
      {copied ? (
        <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-salvia">
          {copiedLabel}
        </span>
      ) : (
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export default function HomeInstallPanel({ locale }: { locale: SiteLocale }) {
  const t = COPY[locale];
  const [tab, setTab] = useState<"unix" | "windows">("unix");
  const command = tab === "windows" ? INSTALL_CMD.windows : INSTALL_CMD.unix;

  return (
    <section id="install" className="border-t border-line bg-paper-deep px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold tracking-tight text-ink md:text-4xl">
          {t.sectionTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          {t.sectionSub}
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-paper p-8">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              {t.desktopKicker}
            </p>
            <DesktopDownloadLink
              label={t.desktopBtn}
              className="mt-6 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-3.5 text-[15px] font-semibold text-paper transition-colors hover:bg-black sm:w-auto"
            />
            <p className="mt-4 font-mono text-[11px] text-ink-faint">{t.desktopMeta}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{t.desktopNote}</p>
          </div>

          <div
            id="install-terminal"
            className="rounded-2xl border border-line bg-paper p-8"
          >
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              {t.terminalKicker}
            </p>
            <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
              <div className="flex border-b border-line text-[13px] font-medium">
                <button
                  type="button"
                  onClick={() => setTab("unix")}
                  className={`flex-1 px-4 py-2.5 transition-colors ${
                    tab === "unix"
                      ? "border-b-2 border-ink text-ink"
                      : "text-ink-faint hover:text-ink-soft"
                  }`}
                >
                  {t.tabUnix}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("windows")}
                  className={`flex-1 px-4 py-2.5 transition-colors ${
                    tab === "windows"
                      ? "border-b-2 border-ink text-ink"
                      : "text-ink-faint hover:text-ink-soft"
                  }`}
                >
                  {t.tabWindows}
                </button>
              </div>
              <div className="flex items-start gap-2 px-4 py-3.5">
                <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-relaxed text-mata">
                  {command}
                </code>
                <CopyButton
                  value={command}
                  label={t.copy}
                  copiedLabel={t.copied}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
