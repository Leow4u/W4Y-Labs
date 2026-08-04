import PublicPage from "@/components/PublicPage";

export const metadata = { title: "Recursos — Work4You" };

export default function RecursosPage() {
  return (
    <PublicPage
      kicker="Recursos"
      title="Aprenda a trabalhar com o seu agente"
      intro="Guias curtos e diretos para tirar o máximo do seu agente — do primeiro pedido às rotinas que rodam sozinhas."
      cards={[
        { title: "Primeiros passos", copy: "Como delegar bem: o que dizer ao agente para receber o trabalho do jeito certo." },
        { title: "Boas práticas de delegação", copy: "Tarefas que rendem mais com agentes — e as que ainda pedem gente." },
        { title: "Rotinas que funcionam", copy: "Exemplos reais de rotinas recorrentes por área, prontas para copiar." },
        { title: "Conectores", copy: "Como ligar suas ferramentas e dar contexto de verdade ao agente." },
        { title: "Aprovação humana", copy: "Como configurar o que precisa do seu OK antes de acontecer." },
        { title: "Perguntas frequentes", copy: "Respostas rápidas sobre segurança, histórico, uso e controle." },
      ]}
      note="A central completa de recursos chega junto com o acesso público — este é o mapa do que vem."
    />
  );
}
