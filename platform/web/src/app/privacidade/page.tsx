import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Política de Privacidade — Work4You" };

// Versão inicial (v1) da Política — LGPD (Lei 13.709/2018); sujeita a
// revisão jurídica formal antes da abertura comercial ampla.
export default function PrivacidadePage() {
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
      <h1 className="mt-7 text-3xl font-extrabold tracking-[-0.02em] text-ink">Política de Privacidade</h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">Última atualização: 5 de julho de 2026 · Versão 1.0</p>

      <section className="mt-8 space-y-6">
        <div>
          <h2 className="font-bold text-ink">1. Quem somos</h2>
          <p className="mt-1">
            A <strong>W4Y-Labs</strong> é a controladora dos dados pessoais tratados na
            plataforma <strong>Work4You</strong> (work4you.ai), nos termos da Lei Geral de
            Proteção de Dados — LGPD (Lei nº 13.709/2018). Contato do encarregado:{" "}
            <strong>contato@work4you.ai</strong>.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">2. Dados que tratamos</h2>
          <p className="mt-1">
            <strong>Conta:</strong> nome e e-mail fornecidos pelo provedor de login (Google)
            ou por você. <strong>Conteúdo:</strong> mensagens, arquivos, memórias,
            rotinas e configurações que você cria ao usar o seu agente. <strong>Técnicos:</strong>{" "}
            registros de acesso (IP, data/hora, navegador) exigidos pelo Marco Civil da Internet,
            e métricas de uso/custo para operação e cobrança.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">3. Para que usamos (bases legais)</h2>
          <p className="mt-1">
            Prestar o serviço contratado (execução de contrato); segurança, prevenção a fraude e
            cumprimento de obrigações legais; melhoria do serviço e comunicação operacional
            (legítimo interesse); e, quando aplicável, consentimento — que pode ser revogado.
            <strong> Não vendemos dados pessoais</strong> e não usamos o seu conteúdo para
            treinar modelos de terceiros.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">4. Com quem compartilhamos (operadores)</h2>
          <p className="mt-1">
            Operamos sobre provedores de infraestrutura e serviço sob contrato: Google Cloud
            (identidade, banco de dados, rede), Fly.io e Tigris Data (execução e armazenamento da
            sua instância de agente), OpenRouter (processamento das solicitações aos modelos de
            IA) e Stripe (pagamentos). Cada mensagem sua é enviada ao provedor de modelo
            estritamente para gerar a resposta. Transferências internacionais seguem as
            salvaguardas da LGPD.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">5. Segurança e retenção</h2>
          <p className="mt-1">
            Usamos criptografia em trânsito (TLS), segredos em cofres gerenciados, isolamento por
            instância e backups com replicação contínua. Dados da conta e conteúdo são mantidos
            enquanto a conta existir; após o encerramento, são eliminados ou anonimizados em até
            90 dias, salvo retenção exigida por lei (ex.: registros fiscais e de acesso).
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">6. Seus direitos (LGPD)</h2>
          <p className="mt-1">
            Você pode solicitar confirmação de tratamento, acesso, correção, portabilidade,
            anonimização ou eliminação dos seus dados, além de revogar consentimentos, pelo
            e-mail <strong>contato@work4you.ai</strong>. Responderemos nos prazos da LGPD. Você
            também pode peticionar à ANPD.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">7. Cookies</h2>
          <p className="mt-1">
            Usamos apenas cookies essenciais de sessão (autenticação da plataforma e do seu
            agente). Não usamos cookies de publicidade.
          </p>
        </div>
        <div>
          <h2 className="font-bold text-ink">8. Alterações</h2>
          <p className="mt-1">
            Esta Política pode ser atualizada; mudanças relevantes serão comunicadas na
            plataforma. O uso continuado após a vigência indica ciência da nova versão. Consulte
            também os nossos <Link href="/termos" className="underline">Termos e Serviços</Link>.
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
