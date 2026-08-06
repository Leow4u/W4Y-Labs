import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Licença de software — Work4You" };

export default function LicencaPage() {
  return (
    <main className="min-h-screen bg-paper px-5 py-12 text-sm leading-relaxed text-ink-soft">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex">
          <Image
            src="/brand/work4you-logo.png"
            alt="Work4You"
            width={2400}
            height={244}
            className="h-[15px] w-auto"
          />
        </Link>
        <h1 className="mt-7 text-3xl font-extrabold tracking-[-0.02em] text-ink">
          Licença de software
        </h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          Última atualização: 6 de agosto de 2026
        </p>

        <section className="mt-8 space-y-6">
          <p>
            O Work4You (aplicativo desktop, motor de agentes e componentes relacionados) é
            software <strong>proprietário</strong> da W4Y Labs. Copyright © 2026 W4Y Labs. Todos
            os direitos reservados.
          </p>
          <div>
            <h2 className="font-bold text-ink">Uso permitido</h2>
            <p className="mt-1">
              Você pode usar o software apenas por meio do site oficial work4you.ai, dos serviços
              em nuvem autenticados operados pela W4Y Labs e do aplicativo desktop oficial
              distribuído pela W4Y Labs ou por canais de atualização autorizados, sujeito aos{" "}
              <Link href="/termos" className="underline">
                Termos de Serviço
              </Link>
              .
            </p>
          </div>
          <div>
            <h2 className="font-bold text-ink">Restrições</h2>
            <p className="mt-1">
              É proibida cópia, modificação, distribuição, sublicenciamento, venda, engenharia
              reversa, descompilação ou desmontagem do software, no todo ou em parte, salvo
              autorização escrita da W4Y Labs.
            </p>
          </div>
          <div>
            <h2 className="font-bold text-ink">Componentes de terceiros</h2>
            <p className="mt-1">
              O software pode incluir bibliotecas de código aberto sujeitas às suas próprias
              licenças. Atribuições estão disponíveis mediante solicitação a{" "}
              <strong>legal@work4you.ai</strong>.
            </p>
          </div>
          <div>
            <h2 className="font-bold text-ink">Sem garantia</h2>
            <p className="mt-1">
              O software é fornecido “como está”, sem garantias de qualquer tipo. A W4Y Labs não
              se responsabiliza por danos decorrentes do uso.
            </p>
          </div>
        </section>

        <footer className="mt-10 border-t border-line pt-4 text-[11px] text-ink-faint">
          <p className="font-mono uppercase tracking-[0.14em]">© 2026 W4Y-Labs · Work4You</p>
        </footer>
      </div>
    </main>
  );
}
