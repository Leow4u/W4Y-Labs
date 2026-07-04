import PublicPage from "@/components/PublicPage";

export const metadata = { title: "Modelos — Work4You" };

export default function ModelosPage() {
  return (
    <PublicPage
      kicker="Modelos"
      title="Modelos prontos de agentes"
      intro="Ative um modelo, ajuste ao seu contexto e delegue. Cada modelo já vem com a função, o tom e as rotinas do papel que ele ocupa."
      cards={[
        { title: "Agente de vendas", copy: "Prospecção, qualificação e follow-up — mantém o funil vivo." },
        { title: "Agente de atendimento", copy: "Primeira resposta em segundos, escalação com contexto completo." },
        { title: "Analista de documentos", copy: "Contratos, propostas e planilhas resumidos com os pontos de atenção." },
        { title: "Assistente financeiro", copy: "Cobranças, conciliações e relatórios recorrentes em dia." },
        { title: "Pesquisador", copy: "Pesquisa de mercado e concorrência com fontes citadas." },
        { title: "Assistente pessoal", copy: "Agenda, e-mails e pendências do dia organizados para você." },
      ]}
      note="Todos os modelos são um ponto de partida — o agente aprende com o seu jeito de trabalhar."
    />
  );
}
