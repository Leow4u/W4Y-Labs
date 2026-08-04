import type { ReactNode } from "react";
import Link from "next/link";

// Blog content registry — ordered newest first (index features POSTS[0]).
// Timeline runs from Dec/2025 (founding manifesto) to now, marking the
// product's evolution. Same copy rules as the docs: user-facing pt-BR,
// no internal names, no promises the product doesn't keep.

function P({ children }: { children: ReactNode }) {
  return <p className="mt-5 leading-relaxed text-ink-soft">{children}</p>;
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-10 text-xl font-bold tracking-[-0.01em] text-ink">
      {children}
    </h2>
  );
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>;
}

function PostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep"
    >
      {children}
    </Link>
  );
}

export interface BlogPost {
  slug: string;
  category: string;
  title: string;
  description: string;
  date: string; // human, pt-BR
  dateISO: string;
  readingMinutes: number;
  body: ReactNode;
}

export const POSTS: BlogPost[] = [
  {
    slug: "da-tarefa-a-rotina",
    category: "Como usar",
    title: "Da primeira tarefa à automação que roda sozinha",
    description:
      "O caminho que os nossos melhores usuários percorrem na primeira semana — em quatro passos.",
    date: "25 de julho de 2026",
    dateISO: "2026-07-25",
    readingMinutes: 4,
    body: (
      <>
        <P>
          Tem um padrão em quem mais extrai valor da Work4You: começa pequeno,
          conecta o essencial e transforma o que funciona em automação. O caminho
          inteiro cabe numa semana. Aqui está ele, em quatro passos.
        </P>
        <H2>1. Uma tarefa de pesquisa</H2>
        <P>
          Comece com algo que você adiaria: “pesquisa os 10 maiores concorrentes do
          meu setor e monta uma planilha comparando preço e proposta de valor”. É o
          tipo de tarefa que mostra o agente trabalhando — navegando, organizando,
          entregando arquivo — sem depender de nenhuma conexão.
        </P>
        <H2>2. Conecte 2 ou 3 aplicativos</H2>
        <P>
          Em <B>Personalizar › Conectores</B>, dê acesso ao que você usa todo dia:
          Gmail, Google Drive, o CRM, o Instagram. A autorização é feita com o
          próprio aplicativo (o mesmo padrão de “Entrar com Google”) e pode ser
          revogada quando quiser. Com acesso, o agente deixa de só produzir — ele
          passa a <B>agir</B>: enviar, atualizar, publicar.
        </P>
        <H2>3. Aprove — e ajuste o rumo</H2>
        <P>
          Nas primeiras tarefas, o agente vai pedir sua aprovação pra ações
          sensíveis. Aproveite: é aí que você calibra a confiança e ensina suas
          preferências, mandando instruções no meio do trabalho. Em pouco tempo
          você sabe exatamente quanta autonomia dar.
        </P>
        <H2>4. Transforme em automação</H2>
        <P>
          A tarefa deu certo? Diga: “faz isso toda segunda às 8h”. Pronto — ela
          entra nas{" "}
          <PostLink href="/documentacao/automacoes">Automações</PostLink> e passa a
          acontecer sem você, com a entrega chegando onde você pediu: na
          plataforma, no e-mail, no WhatsApp.
        </P>
        <P>
          Esse é o momento em que o agente deixa de ser uma ferramenta que você usa
          e vira <B>parte do time</B>. O passo a passo completo está em{" "}
          <PostLink href="/documentacao/primeiros-passos">
            Primeiros passos
          </PostLink>
          .
        </P>
      </>
    ),
  },
  {
    slug: "personalizar-o-seu-agente",
    category: "Produto",
    title: "Personalizar: um agente só, do seu jeito",
    description:
      "Skills, Conectores e MCPs — as capacidades que o seu trabalho pede, escolhidas por você.",
    date: "18 de junho de 2026",
    dateISO: "2026-06-18",
    readingMinutes: 3,
    body: (
      <>
        <P>
          Desde o início, a Work4You é sobre delegar de verdade. E delegar bem
          depende menos de ter “uma IA pra cada coisa” e mais de ter{" "}
          <B>um agente que sabe o que você precisa</B>. É pra isso que existe a
          tela <B>Personalizar</B>: o lugar onde você molda o seu agente — o
          mesmo de sempre, com as capacidades que o seu trabalho pede.
        </P>
        <H2>Skills: o que ele sabe fazer</H2>
        <P>
          <B>Skills</B> são habilidades que o agente ganha: montar apresentação,
          tratar planilha, editar imagem, escrever num formato específico. Ligue
          as que interessam, desligue as que não. No <B>Marketplace</B> você
          navega pelo catálogo por categoria e ativa com um clique — sem
          configurar nada.
        </P>
        <H2>Conectores: onde ele age</H2>
        <P>
          <B>Conectores</B> dão ao agente acesso autorizado aos aplicativos que
          você já usa — Gmail, Drive, o CRM, o Instagram e mais de mil outros.
          Com eles, o agente deixa de só produzir e passa a agir: manda o e-mail,
          atualiza a planilha, publica o post. A autorização é feita com o
          próprio aplicativo e pode ser revogada quando quiser.
        </P>
        <H2>MCPs: conexões avançadas</H2>
        <P>
          A novidade da vez. Os <B>MCPs</B> são conexões avançadas para
          ferramentas externas: se o sistema que você usa oferece uma conexão
          desse tipo, basta apontar o agente pra ela e as ferramentas de lá
          passam a ficar disponíveis. É a porta aberta pro que ainda não está no
          catálogo.
        </P>
        <P>
          Um agente só, ajustado ao seu trabalho — e reajustável amanhã, quando o
          trabalho mudar. O guia completo está em{" "}
          <PostLink href="/documentacao/personalizar">Personalizar</PostLink>.
        </P>
      </>
    ),
  },
  {
    slug: "agenda-rotinas-24-7",
    category: "Produto",
    title: "Agenda: o dia em que o seu agente ganhou compromissos",
    description:
      "Rotinas recorrentes que acontecem sozinhas — todo dia, toda semana, no horário que você definir.",
    date: "14 de maio de 2026",
    dateISO: "2026-05-14",
    readingMinutes: 3,
    body: (
      <>
        <P>
          Delegar uma tarefa é bom. Nunca mais precisar delegar aquela tarefa é
          melhor. Com a <B>Agenda</B>, o seu agente ganha compromissos: “toda
          segunda às 8h, resume os e-mails da semana”, “todo dia às 18h, confere se
          entrou lead novo no CRM e me avisa no WhatsApp”. Você define uma vez; ele
          cumpre sempre.
        </P>
        <H2>Três jeitos de criar uma rotina</H2>
        <P>
          <B>Conversando</B> — peça na própria sessão: “faz isso toda sexta às
          17h”. <B>Pela tela da Agenda</B> — montando frequência, horário e
          instruções. <B>Pela galeria de templates</B> — rotinas prontas pra
          adaptar: resumo diário, monitoramento, acompanhamento de clientes.
        </P>
        <H2>Na nuvem, não no seu navegador</H2>
        <P>
          Rotinas rodam no computador do agente, na nuvem — o seu pode estar
          desligado. Cada execução fica registrada com o resultado, e a entrega
          chega onde você pedir: na plataforma, no e-mail, no WhatsApp. O{" "}
          <B>Calendário</B> mostra tudo que está agendado — rotinas, gatilhos e
          próximas execuções.
        </P>
        <P>
          É o que faz o agente continuar depois que você sai. Detalhes em{" "}
          <PostLink href="/documentacao/automacoes">Automações</PostLink>.
        </P>
      </>
    ),
  },
  {
    slug: "conectores-mil-aplicativos",
    category: "Produto",
    title: "Mais de 1.000 aplicativos, um agente só",
    description:
      "Gmail, Drive, CRM, Instagram, Google Ads — o seu agente agora age dentro das ferramentas que você já usa.",
    date: "2 de abril de 2026",
    dateISO: "2026-04-02",
    readingMinutes: 3,
    body: (
      <>
        <P>
          Um agente que só produz texto ainda deixa o trabalho final com você:
          copiar, colar, enviar, publicar. Os <B>Conectores</B> fecham esse último
          quilômetro — com acesso autorizado, o agente <B>age</B> nos seus
          aplicativos: manda o e-mail, atualiza a planilha, registra no CRM,
          publica o post.
        </P>
        <H2>Mais de 1.000 apps, autorização em um clique</H2>
        <P>
          Gmail, Google Drive, Sheets, Calendar, Notion, HubSpot, Instagram,
          Facebook, Google Ads e mais de mil outros. A autorização é feita direto
          com o próprio aplicativo (padrão OAuth, o mesmo de “Entrar com Google”) —
          e se uma tarefa precisar de um app ainda não conectado, o agente mostra o
          cartão de conexão <B>no meio da conversa</B>.
        </P>
        <H2>Controle fino, sempre</H2>
        <P>
          Cada agente só enxerga os apps que você deu a ele. Dá pra desligar um
          aplicativo numa conversa específica — útil quando aquela tarefa não deve
          tocar no seu e-mail. E desconectou, o acesso morre na hora. O guia está
          em <PostLink href="/documentacao/conectores">Conectores</PostLink>.
        </P>
      </>
    ),
  },
  {
    slug: "seu-agente-no-whatsapp",
    category: "Produto",
    title: "Seu agente agora atende no WhatsApp",
    description:
      "Canais chegaram: mande tarefas e receba entregas por onde você já conversa — sem abrir a plataforma.",
    date: "25 de fevereiro de 2026",
    dateISO: "2026-02-25",
    readingMinutes: 3,
    body: (
      <>
        <P>
          O melhor lugar pro seu agente é onde você já está. Com os <B>Canais</B>,
          você conecta o WhatsApp — e também Telegram, Slack, Discord, e-mail,
          Microsoft Teams, SMS e outros — e passa a comandar o agente por ali, sem
          abrir a plataforma.
        </P>
        <H2>Nos dois sentidos</H2>
        <P>
          Cada canal funciona de ida e de volta: você manda “vê no CRM se entrou
          lead novo” do celular, e a resposta chega em segundos — com resumo e
          arquivos. Pediu uma proposta de dentro do carro, a proposta chega ali
          mesmo, em PDF.
        </P>
        <H2>E os seus clientes também</H2>
        <P>
          O uso que mais nos animou nos testes: <B>atendimento</B> no WhatsApp da
          empresa — o mesmo agente, respondendo com o conhecimento e o tom que
          você configurou. Configure cada canal na tela Canais: WhatsApp da
          empresa para clientes, o seu Telegram ou e-mail para mandar tarefas.
        </P>
        <P>
          Como conectar, o que funciona em cada plano e as boas práticas:{" "}
          <PostLink href="/documentacao/canais">Canais, na documentação</PostLink>.
        </P>
      </>
    ),
  },
  {
    slug: "por-que-somos-agnosticos-de-modelo",
    category: "Visão",
    title: "Por que não te prendemos a um modelo de IA",
    description:
      "A corrida dos modelos muda toda semana. Sua operação não pode depender de apostar no cavalo certo.",
    date: "20 de janeiro de 2026",
    dateISO: "2026-01-20",
    readingMinutes: 3,
    body: (
      <>
        <P>
          Em um ano, o “melhor modelo de IA do mundo” trocou de dono várias vezes.
          Cada lançamento reordena o pódio — em raciocínio, em escrita, em código,
          em preço. Pra quem acompanha a área, é fascinante. Pra quem tem uma
          empresa pra tocar, é ruído.
        </P>
        <P>
          Por isso a Work4You nasceu <B>agnóstica de modelo</B>: o seu agente não é
          refém de um fornecedor. Ele usa os principais modelos do mercado, e
          quando o pódio mudar de novo, você se beneficia sem migrar nada.
        </P>
        <H2>Auto: a escolha certa por tarefa</H2>
        <P>
          Modelos têm perfis diferentes. Usar o mais caro pra toda tarefa é
          desperdício; usar o mais barato pra tudo é resultado fraco. O modo{" "}
          <B>Auto</B> analisa cada tarefa e direciona pro modelo mais indicado,
          equilibrando qualidade e custo. Pesquisa rápida não paga preço de
          raciocínio profundo — e problema difícil não fica na mão de modelo
          fraco.
        </P>
        <H2>E o controle continua seu</H2>
        <P>
          Prefere um modelo específico? É só escolher — o seletor está a um clique
          na hora de delegar. Transparência total: você sempre sabe qual modelo
          trabalhou. Detalhes em{" "}
          <PostLink href="/documentacao/planos-e-creditos">
            Planos e uso
          </PostLink>
          .
        </P>
      </>
    ),
  },
  {
    slug: "apresentando-a-work4you",
    category: "Produto",
    title: "Apresentando a Work4You",
    description:
      "Um agente de IA com computador próprio na nuvem, que trabalha por você — e o convite pro nosso acesso antecipado.",
    date: "10 de dezembro de 2025",
    dateISO: "2025-12-10",
    readingMinutes: 4,
    body: (
      <>
        <P>
          Toda semana aparece uma IA nova que conversa melhor. Mas conversar nunca
          foi o gargalo de quem empreende. O gargalo é o trabalho que se acumula
          enquanto você conversa: a planilha que precisa existir, a proposta que
          precisa sair, o cliente que precisa de resposta, o post que precisa ser
          publicado.
        </P>
        <P>
          A Work4You nasceu pra atacar esse gargalo. Não construímos mais um chat —
          construímos um <B>agente com computador próprio na nuvem</B>. Ele navega,
          pesquisa, escreve, mexe em planilha, acessa os aplicativos que você
          autorizar e devolve <B>trabalho pronto</B>: o arquivo, o post publicado, o
          e-mail enviado.
        </P>
        <H2>O que isso muda na prática</H2>
        <P>
          Você delega como delegaria pra uma pessoa: “pesquisa os concorrentes e
          monta um comparativo”, “prepara 3 posts pra semana”, “confere se entrou
          lead novo e me avisa”. O agente executa passo a passo, à vista, pedindo
          aprovação antes de qualquer ação sensível. E quando uma tarefa dá certo,
          ela pode virar recorrente — o agente passa a fazer sozinho, com o seu
          computador desligado.
        </P>
        <H2>Sem apostar num só modelo de IA</H2>
        <P>
          Dentro da Work4You você usa os principais modelos do mercado, e o modo{" "}
          <B>Auto</B> escolhe o mais indicado pra cada tarefa, equilibrando
          qualidade e custo. Acreditamos que a sua operação não pode depender de
          apostar no fornecedor certo — sobre isso ainda vamos escrever mais.
        </P>
        <H2>Estamos em acesso antecipado</H2>
        <P>
          A Work4You está aberta em acesso antecipado: um grupo menor de usuários,
          proximidade real com o time e evolução guiada por quem usa. O plano
          Grátis não pede cartão —{" "}
          <PostLink href="/login">crie sua conta</PostLink> e delegue a primeira
          tarefa. A <PostLink href="/documentacao">documentação</PostLink> mostra o
          caminho.
        </P>
      </>
    ),
  },
];

export function postBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
