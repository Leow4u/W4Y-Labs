import type { ReactNode } from "react";
import Link from "next/link";

// Blog content registry — launch set. Same copy rules as the docs:
// user-facing pt-BR, no internal names, no promises the product doesn't keep.

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
    slug: "apresentando-a-work4you",
    category: "Produto",
    title: "Apresentando a Work4You",
    description:
      "Um agente de IA com computador próprio na nuvem, que trabalha por você — e o convite pro nosso acesso antecipado.",
    date: "25 de julho de 2026",
    dateISO: "2026-07-25",
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
          lead novo e me avisa no WhatsApp”. O agente executa passo a passo, à
          vista, pedindo aprovação antes de qualquer ação sensível. E quando uma
          tarefa dá certo, ela vira <B>rotina</B> — o agente passa a fazer sozinho,
          no horário combinado, com o seu computador desligado.
        </P>
        <H2>Sem apostar num só modelo de IA</H2>
        <P>
          Dentro da Work4You você usa os principais modelos do mercado — Opus 5,
          Sonnet 5, GPT-5.6 Sol, Grok 4.5 — e o modo <B>Auto</B> escolhe o mais
          indicado pra cada tarefa, equilibrando qualidade e custo.{" "}
          <PostLink href="/blog/por-que-somos-agnosticos-de-modelo">
            Escrevemos sobre essa escolha aqui.
          </PostLink>
        </P>
        <H2>Estamos em acesso antecipado</H2>
        <P>
          A Work4You está aberta em acesso antecipado: um grupo menor de usuários,
          proximidade real com o time e evolução guiada por quem usa. O plano
          Grátis não pede cartão — <PostLink href="/login">crie sua conta</PostLink>{" "}
          e delegue a primeira tarefa hoje. A{" "}
          <PostLink href="/documentacao">documentação</PostLink> mostra o caminho.
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
    date: "25 de julho de 2026",
    dateISO: "2026-07-25",
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
          refém de um fornecedor. Ele usa os principais modelos do mercado — Opus 5,
          Sonnet 5, GPT-5.6 Sol, Grok 4.5 — e quando o pódio mudar de novo, você se
          beneficia sem migrar nada.
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
            Planos e créditos
          </PostLink>
          .
        </P>
      </>
    ),
  },
  {
    slug: "da-tarefa-a-rotina",
    category: "Como usar",
    title: "Da primeira tarefa à rotina que roda sozinha",
    description:
      "O caminho que os nossos melhores usuários percorrem na primeira semana — em quatro passos.",
    date: "25 de julho de 2026",
    dateISO: "2026-07-25",
    readingMinutes: 4,
    body: (
      <>
        <P>
          Tem um padrão em quem mais extrai valor da Work4You: começa pequeno,
          conecta o essencial e transforma o que funciona em rotina. O caminho
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
          Agora dê acesso ao que você usa todo dia: Gmail, Google Drive, o CRM, o
          Instagram. A autorização é feita com o próprio aplicativo (o mesmo padrão
          de “Entrar com Google”) e pode ser revogada quando quiser. Com acesso, o
          agente deixa de só produzir — ele passa a <B>agir</B>: enviar, atualizar,
          publicar.
        </P>
        <H2>3. Aprove — e ajuste o rumo</H2>
        <P>
          Nas primeiras tarefas, o agente vai pedir sua aprovação pra ações
          sensíveis. Aproveite: é aí que você calibra a confiança e ensina suas
          preferências, mandando instruções no meio do trabalho. Em pouco tempo
          você sabe exatamente quanta autonomia dar.
        </P>
        <H2>4. Transforme em rotina</H2>
        <P>
          A tarefa deu certo? Diga: “faz isso toda segunda às 8h”. Pronto — ela
          entra na <PostLink href="/documentacao/agenda">Agenda</PostLink> e passa a
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
];

export function postBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
