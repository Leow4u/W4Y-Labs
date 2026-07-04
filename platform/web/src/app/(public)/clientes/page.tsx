import PublicPage from "@/components/PublicPage";

export const metadata = { title: "Clientes — Work4You" };

export default function ClientesPage() {
  return (
    <PublicPage
      kicker="Clientes"
      title="Feita para quem faz o trabalho acontecer"
      intro="Da operação enxuta à equipe em crescimento: a Work4You entra onde há trabalho repetitivo demais para gente boa de mais."
      cards={[
        { title: "Times de vendas", copy: "Mais conversas com clientes, menos tempo montando follow-up." },
        { title: "Atendimento e suporte", copy: "Fila menor, resposta consistente e cliente ouvido." },
        { title: "Back-office", copy: "Financeiro, jurídico e operações com rotinas que rodam sozinhas." },
        { title: "Fundadores e gestores", copy: "Delegue o operacional e mantenha visibilidade de tudo pelo histórico." },
      ]}
      note="Estamos em fase de acesso inicial — os primeiros casos de cliente serão publicados aqui."
    />
  );
}
