import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Termos e Serviços — Work4You" };

// Versão inicial (v1) dos Termos — redigida para o MVP e sujeita a revisão
// jurídica formal antes da abertura comercial ampla.
export default function TermosPage() {
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
      <h1 className="mt-7 text-3xl font-extrabold tracking-[-0.02em] text-ink">Termos e Serviços</h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">Última atualização: 6 de agosto de 2026 · Versão 1.1</p>

      <section className="mt-8 space-y-6">
        <div>
          <h2 className="font-bold text-ink">1. O serviço</h2>
          <p className="mt-1">
            A <strong>Work4You</strong> é uma plataforma de agentes de IA autônomos e
            persistentes, desenvolvida pela <strong>W4Y-Labs</strong>. O
            serviço permite conversar, delegar tarefas, executar automações, gerenciar arquivos,
            rotinas e integrações a partir do domínio work4you.ai.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">2. Conta e acesso</h2>
          <p className="mt-1">
            O acesso exige conta autenticada (Google ou e-mail/senha). Você é
            responsável pela guarda das suas credenciais e por toda atividade realizada na sua
            conta. Durante o período de acesso antecipado, a liberação de contas pode ser
            restrita e revogada a critério da W4Y-Labs.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">3. Uso aceitável</h2>
          <p className="mt-1">
            É vedado usar a plataforma para atividades ilegais, para gerar ou distribuir malware,
            para violar direitos de terceiros (incluindo propriedade intelectual e privacidade),
            para spam ou abuso de plataformas externas, ou para tentar comprometer a segurança do
            serviço. Automações executadas pelo seu agente em serviços de terceiros devem
            respeitar os termos desses serviços.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">4. Conteúdo e resultados de IA</h2>
          <p className="mt-1">
            As respostas e artefatos são gerados por modelos de inteligência artificial e podem
            conter erros. Você mantém a titularidade do conteúdo que envia e dos artefatos
            gerados a partir dele; concede à W4Y-Labs a licença estritamente necessária para
            operar o serviço (processar, armazenar e transmitir seu conteúdo). Revise resultados
            antes de usá-los em decisões relevantes — o serviço não fornece aconselhamento
            jurídico, médico ou financeiro.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">5. Planos e cobrança</h2>
          <p className="mt-1">
            Recursos podem ser oferecidos em planos gratuitos e pagos. Cada plano inclui uso
            que reinicia a cada ciclo de cobrança; planos pagos podem oferecer uso on-demand
            opcional, sujeito a um limite de gasto definido por você. Valores, limites e
            condições de cada plano são apresentados no momento da contratação, processada
            por meio do provedor de pagamentos Stripe. O uso além do incluído é reportado no
            fim do ciclo e cobrado na fatura seguinte, conforme as regras do plano.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">6. Disponibilidade e alterações</h2>
          <p className="mt-1">
            O serviço é fornecido “como está”, em fase de acesso antecipado, sem garantia de
            disponibilidade ininterrupta. Podemos alterar, suspender ou descontinuar
            funcionalidades, com aviso razoável quando a mudança for materialmente adversa a
            assinantes pagos.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">7. Limitação de responsabilidade</h2>
          <p className="mt-1">
            Na máxima extensão permitida pela lei, a responsabilidade total da W4Y-Labs
            relacionada ao serviço limita-se ao valor pago por você nos 12 meses anteriores ao
            evento. A W4Y-Labs não responde por danos indiretos, lucros cessantes ou perda de
            dados causada por uso em desacordo com estes Termos.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">8. Privacidade</h2>
          <p className="mt-1">
            O tratamento de dados pessoais é descrito na nossa{" "}
            <Link href="/privacidade" className="underline">Política de Privacidade</Link>, que
            integra estes Termos.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">9. Encerramento</h2>
          <p className="mt-1">
            Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar contas
            que violem estes Termos. Após o encerramento, dados são eliminados ou anonimizados
            nos prazos descritos na Política de Privacidade.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">10. Software proprietário</h2>
          <p className="mt-1">
            O aplicativo desktop Work4You, o motor de agentes e demais componentes distribuídos
            pela W4Y-Labs são <strong>software proprietário</strong>, licenciados — não vendidos —
            para uso pessoal conforme estes Termos. É proibida engenharia reversa, descompilação,
            redistribuição, sublicenciamento ou cópia não autorizada. Detalhes em{" "}
            <Link href="/legal/licenca" className="underline">Licença de software</Link>.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">11. Lei aplicável e contato</h2>
          <p className="mt-1">
            Estes Termos são regidos pelas leis da República Federativa do Brasil, com foro na
            comarca de domicílio do usuário. Dúvidas: <strong>contato@work4you.ai</strong>.
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
