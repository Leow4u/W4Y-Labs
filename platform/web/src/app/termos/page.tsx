import Link from "next/link";

export const metadata = { title: "Termos e Serviços — Work4You" };

// Versão inicial (v1) dos Termos — redigida para o MVP e sujeita a revisão
// jurídica formal antes da abertura comercial ampla.
export default function TermosPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
      <p className="font-brand text-xs tracking-wider text-neutral-400">
        <Link href="/">Work4You</Link> · W4Y-Labs
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Termos e Serviços</h1>
      <p className="mt-1 text-xs text-neutral-500">Última atualização: 5 de julho de 2026 · Versão 1.0</p>

      <section className="mt-8 space-y-6">
        <div>
          <h2 className="font-semibold">1. O serviço</h2>
          <p className="mt-1">
            A <strong>Work4You</strong> é uma plataforma de agentes de IA autônomos e persistentes
            — o <strong>Wayne Agent</strong> — desenvolvida pela <strong>W4Y-Labs</strong>. O
            serviço permite conversar, delegar tarefas, executar automações, gerenciar arquivos,
            rotinas e integrações a partir do domínio work4you.ai.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">2. Conta e acesso</h2>
          <p className="mt-1">
            O acesso exige conta autenticada (Google, Microsoft ou e-mail/senha). Você é
            responsável pela guarda das suas credenciais e por toda atividade realizada na sua
            conta. Durante o período de acesso antecipado, a liberação de contas pode ser
            restrita e revogada a critério da W4Y-Labs.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">3. Uso aceitável</h2>
          <p className="mt-1">
            É vedado usar a plataforma para atividades ilegais, para gerar ou distribuir malware,
            para violar direitos de terceiros (incluindo propriedade intelectual e privacidade),
            para spam ou abuso de plataformas externas, ou para tentar comprometer a segurança do
            serviço. Automações executadas pelo seu agente em serviços de terceiros devem
            respeitar os termos desses serviços.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">4. Conteúdo e resultados de IA</h2>
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
          <h2 className="font-semibold">5. Planos, créditos e cobrança</h2>
          <p className="mt-1">
            Recursos podem ser oferecidos em planos gratuitos e pagos, com créditos de consumo.
            Valores, limites e condições de cada plano são apresentados no momento da
            contratação, processada por meio do provedor de pagamentos Stripe. Créditos de
            assinatura podem expirar conforme as regras do plano; créditos avulsos (top-up) não
            expiram, salvo indicação em contrário.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">6. Disponibilidade e alterações</h2>
          <p className="mt-1">
            O serviço é fornecido “como está”, em fase de acesso antecipado, sem garantia de
            disponibilidade ininterrupta. Podemos alterar, suspender ou descontinuar
            funcionalidades, com aviso razoável quando a mudança for materialmente adversa a
            assinantes pagos.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">7. Limitação de responsabilidade</h2>
          <p className="mt-1">
            Na máxima extensão permitida pela lei, a responsabilidade total da W4Y-Labs
            relacionada ao serviço limita-se ao valor pago por você nos 12 meses anteriores ao
            evento. A W4Y-Labs não responde por danos indiretos, lucros cessantes ou perda de
            dados causada por uso em desacordo com estes Termos.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">8. Privacidade</h2>
          <p className="mt-1">
            O tratamento de dados pessoais é descrito na nossa{" "}
            <Link href="/privacidade" className="underline">Política de Privacidade</Link>, que
            integra estes Termos.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">9. Encerramento</h2>
          <p className="mt-1">
            Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar contas
            que violem estes Termos. Após o encerramento, dados são eliminados ou anonimizados
            nos prazos descritos na Política de Privacidade.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">10. Lei aplicável e contato</h2>
          <p className="mt-1">
            Estes Termos são regidos pelas leis da República Federativa do Brasil, com foro na
            comarca de domicílio do usuário. Dúvidas: <strong>contato@work4you.ai</strong>.
          </p>
        </div>
      </section>

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-[11px] text-neutral-400 dark:border-neutral-800">
        <p className="font-brand tracking-wider">© 2026 W4Y-Labs · Work4You</p>
      </footer>
    </main>
  );
}
