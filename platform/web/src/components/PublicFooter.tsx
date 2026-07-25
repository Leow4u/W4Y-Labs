import Image from "next/image";
import Link from "next/link";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Produto",
    links: [
      { href: "/plataforma", label: "Plataforma" },
      { href: "/precos", label: "Preços" },
      { href: "/login", label: "Entrar" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { href: "/documentacao", label: "Documentação" },
      { href: "/ajuda", label: "Ajuda" },
      { href: "/blog", label: "Blog" },
      { href: "/comunidade", label: "Comunidade" },
      { href: "/workshops", label: "Workshops" },
      { href: "/carreiras", label: "Carreiras" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/termos", label: "Termos e Serviços" },
      { href: "/privacidade", label: "Privacidade" },
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="border-t border-line bg-paper-deep px-6">
      <div className="mx-auto grid max-w-6xl gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Image
            src="/brand/work4you-logo.png"
            alt="Work4You"
            width={2400}
            height={244}
            className="h-5 w-auto"
          />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
            Construa o seu agente de IA. Coloque ele pra rodar 24/7.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
              {c.title}
            </p>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-ink-soft transition-colors hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between py-5">
          <p className="text-xs text-ink-faint">
            © 2026 W4Y-Labs. Todos os direitos reservados.
          </p>
          <p className="font-mono text-xs text-ink-faint">work4you.ai</p>
        </div>
      </div>
    </footer>
  );
}
