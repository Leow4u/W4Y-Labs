import DesktopDownloadLink from "@/components/DesktopDownloadLink";

export default function HeroInstallCtas({
  downloadLabel,
  terminalLabel,
}: {
  downloadLabel: string;
  terminalLabel: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <DesktopDownloadLink
        label={downloadLabel}
        className="inline-flex items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-paper transition-colors hover:bg-black"
      />
      <a
        href="#install-terminal"
        className="inline-flex items-center justify-center rounded-full border border-line bg-paper px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-ink/30 hover:bg-paper-deep"
      >
        {terminalLabel}
      </a>
    </div>
  );
}
