import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

// Layout das páginas PÚBLICAS (landing + institucionais). Fundo claro sempre —
// a experiência pública da Work4You é limpa e confiante, sem cara de painel.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <PublicHeader />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
