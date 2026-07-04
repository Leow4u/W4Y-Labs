import PublicPage from "@/components/PublicPage";

export const metadata = { title: "Soluções — Work4You" };

export default function SolucoesPage() {
  return (
    <PublicPage
      kicker="Soluções"
      title="Um funcionário digital para cada área"
      intro="Cada área tem trabalho que se repete. A Work4You assume a repetição — e o seu time fica com o que exige gente."
      cards={[
        { title: "Vendas", copy: "Qualificação de leads, follow-ups no prazo e propostas montadas a partir do seu material." },
        { title: "Atendimento", copy: "Respostas rápidas no tom da empresa, com aprovação humana para casos sensíveis." },
        { title: "Operações", copy: "Checklists, atualizações de sistemas e relatórios executados todos os dias, sem lembrete." },
        { title: "Financeiro", copy: "Conciliação, cobrança e fechamento com histórico completo de cada passo." },
        { title: "Jurídico", copy: "Leitura e análise de contratos com registro de tudo o que foi considerado." },
        { title: "RH", copy: "Triagem de currículos, onboarding e comunicação interna sem fila de espera." },
      ]}
    />
  );
}
