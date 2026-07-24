import Image from "next/image";
import Link from "next/link";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Produto",
    links: [
      { href: "/plataforma", label: "Plataforma" },
      { href: "/modelos", label: "Modelos de agentes" },
      { href: "/precos", label: "Preços" },
    ],
  },
  {
    title: "Soluções",
    links: [
      { href: "/solucoes", label: "Por área" },
      { href: "/clientes", label: "Clientes" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { href: "/recursos", label: "Central de recursos" },
      { href: "/login", label: "Entrar" },
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="border-t border-neutral-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Image
            src="/brand/work4you-logo.png"
            alt="Work4You"
            width={2400}
            height={244}
            className="h-5 w-auto"
          />
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
            Funcionários digitais para o trabalho de todo dia — com aprovação
            humana, histórico e controle.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {c.title}
            </p>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <p className="text-xs text-neutral-400">
            © 2026 <span className="font-brand">W4Y-Labs</span>. Todos os direitos reservados.
          </p>
          <p className="font-brand text-xs text-neutral-400">work4you.ai</p>
        </div>
      </div>
    </footer>
  );
}
