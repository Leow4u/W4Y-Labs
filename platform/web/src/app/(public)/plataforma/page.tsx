import PublicPage from "@/components/PublicPage";

export const metadata = { title: "Plataforma — Work4You" };

export default function PlataformaPage() {
  return (
    <PublicPage
      kicker="Plataforma"
      title="Criar, executar e monitorar agentes"
      intro="A Work4You é onde o trabalho delegado acontece: agentes que conversam, executam e aprendem com a sua operação — sob o seu controle."
      cards={[
        { title: "Chat de trabalho", copy: "Converse com o agente como conversaria com alguém do time: peça, ajuste, aprove." },
        { title: "Criação de agentes", copy: "Descreva a função em português ou parta de um modelo pronto — sem configuração técnica." },
        { title: "Rotinas", copy: "Trabalhos recorrentes rodam sozinhos: relatório da manhã, cobrança da sexta, fechamento do mês." },
        { title: "Arquivos", copy: "Planilhas, contratos, PDFs e imagens: o agente lê, entende e devolve o resultado pronto." },
        { title: "Conectores", copy: "As ferramentas que sua empresa já usa, conectadas com poucos cliques." },
        { title: "Histórico e uso", copy: "Cada tarefa registrada, cada custo visível. Controle de verdade, sem planilha paralela." },
      ]}
      note="Trabalhos longos continuam rodando na nuvem mesmo com você offline — o agente avisa quando termina."
    />
  );
}
