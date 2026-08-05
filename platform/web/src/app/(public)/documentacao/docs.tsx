import type { ReactNode } from "react";
import Link from "next/link";

// Documentation content registry — single source for the index, the sidebar
// and the article pages. Copy rules: user-facing pt-BR only, no internal
// names, no promises the product does not keep.

/* ---------- typographic helpers ---------- */

function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 leading-relaxed text-ink-soft">{children}</p>;
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-10 text-xl font-bold tracking-[-0.01em] text-ink">
      {children}
    </h2>
  );
}

function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 leading-relaxed text-ink-soft">
          <span className="mt-[0.62em] h-1.5 w-1.5 shrink-0 rounded-full bg-salvia" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border border-line bg-cream px-5 py-4">
      <p className="text-sm leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-4 space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 leading-relaxed text-ink-soft">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-salvia-soft font-mono text-[11px] font-semibold text-mata">
            {i + 1}
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>;
}

function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep">
      {children}
    </Link>
  );
}

/* ---------- registry ---------- */

export interface DocPage {
  slug: string;
  category: string;
  nav: string; // short label for the sidebar
  title: string;
  description: string;
  body: ReactNode;
}

export const CATEGORIES = [
  "Comece por aqui",
  "No dia a dia",
  "Personalize",
  "Conexões",
  "Plataformas",
] as const;

export const DOCS: DocPage[] = [
  /* ============ Comece por aqui ============ */
  {
    slug: "o-que-e",
    category: "Comece por aqui",
    nav: "O que é a Work4You",
    title: "O que é a Work4You",
    description:
      "Um agente de IA com computador próprio na nuvem, que trabalha por você e entrega resultado pronto.",
    body: (
      <>
        <P>
          A Work4You é uma plataforma onde você <B>personaliza o seu agente de IA</B> e
          coloca ele pra trabalhar. Diferente de um chat comum, o seu agente tem um{" "}
          <B>computador próprio na nuvem</B>: ele navega na internet, mexe em
          planilhas, escreve documentos, acessa os aplicativos que você autorizar e
          devolve o trabalho pronto — não só uma resposta.
        </P>
        <H2>Como ele trabalha</H2>
        <P>
          Você descreve o que precisa, em português, como faria com uma pessoa do seu
          time. O agente monta um plano, executa passo a passo e mostra tudo em tempo
          real. Quando uma ação é sensível — rodar um comando, publicar algo — ele{" "}
          <B>pede a sua aprovação antes</B>.
        </P>
        <H2>Todos os melhores modelos, num só lugar</H2>
        <P>
          A Work4You não te prende a um modelo de IA. O modo <B>Auto</B> analisa cada
          tarefa e direciona pro modelo mais indicado, equilibrando qualidade e
          custo. Se preferir, escolha manualmente entre os principais modelos do
          mercado, como Opus 5, Sonnet 5, GPT-5.6 Sol e Grok 4.5.
        </P>
        <H2>O trabalho continua sem você</H2>
        <P>
          O agente vive na nuvem, não no seu navegador. Você pode fechar a aba,
          desligar o computador — ele continua o trabalho e te avisa quando terminar.
          Com as{" "}
          <DocLink href="/documentacao/automacoes">Automações</DocLink>, ele também
          executa tarefas repetitivas sozinho, na hora marcada ou quando algo
          acontece.
        </P>
        <Note>
          Cada cliente tem uma <B>instância dedicada</B>: seu agente, seus arquivos e
          sua memória ficam num ambiente só seu, separado dos demais.
        </Note>
      </>
    ),
  },
  {
    slug: "primeiros-passos",
    category: "Comece por aqui",
    nav: "Primeiros passos",
    title: "Primeiros passos",
    description: "Da conta criada à primeira tarefa entregue, em poucos minutos.",
    body: (
      <>
        <Steps
          items={[
            <>
              <B>Crie a sua conta</B> em{" "}
              <DocLink href="/login">work4you.ai/login</DocLink> — com Google ou
              e-mail e senha. O plano Grátis não pede cartão.
            </>,
            <>
              <B>Descreva a primeira tarefa</B> na caixa de mensagem. Seja
              específico — contexto, prazo e formato. Exemplo: “Pesquisa os 10 maiores concorrentes
              de [seu setor] no Brasil e monta uma planilha comparando preço e
              proposta de valor”.
            </>,
            <>
              <B>Acompanhe em tempo real.</B> O agente mostra cada passo — o que está
              lendo, o que está fazendo. Você pode intervir a qualquer momento com
              uma nova instrução, sem recomeçar.
            </>,
            <>
              <B>Aprove quando ele pedir.</B> Ações sensíveis vêm com um pedido de
              aprovação. Você decide: permitir uma vez, permitir sempre ou negar.
            </>,
            <>
              <B>Receba os artefatos.</B> Planilhas, documentos, imagens e
              apresentações aparecem na conversa prontos pra abrir, pré-visualizar e
              baixar.
            </>,
          ]}
        />
        <H2>Dicas pra primeira semana</H2>
        <UL
          items={[
            <>
              Comece com tarefas de pesquisa e organização — são rápidas e mostram
              como o agente trabalha.
            </>,
            <>
              Conecte 2 ou 3 aplicativos que você usa todo dia (Gmail, Google Drive,
              WhatsApp) na tela de{" "}
              <DocLink href="/documentacao/conectores">Conectores</DocLink>.
            </>,
            <>
              Quando uma tarefa der certo, transforme em{" "}
              <DocLink href="/documentacao/automacoes">automação</DocLink> — o agente
              passa a fazer sozinho, no horário que você definir.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    slug: "planos-e-creditos",
    category: "Comece por aqui",
    nav: "Planos e uso",
    title: "Planos e uso",
    description: "Como funciona a cobrança: uso incluído por plano, on-demand opcional, sem surpresa.",
    body: (
      <>
        <P>
          Cada plano inclui um <B>pool de uso</B> que reinicia a cada ciclo de cobrança.
          Tarefas simples consomem menos; pesquisas longas ou modo MAX consomem mais.
          Quando o uso incluído acaba, o agente para e avisa — ou você ativa{" "}
          <B>on-demand</B> em Configurações → Conta, com um <B>limite de gasto</B> por
          ciclo. O overage é reportado no fim do ciclo e cobrado na próxima fatura.{" "}
          <B>Nunca existe cobrança surpresa.</B>
        </P>
        <H2>Os planos</H2>
        <UL
          items={[
            <>
              <B>Grátis</B> — Relay 2.5 Fast (modelo de casa). Sem cartão de crédito.
              Resto do catálogo com cadeado até upgrade.
            </>,
            <>
              <B>Essencial (US$ 20/mês)</B> — US$ 20 de uso incluído por ciclo,
              catálogo completo e sua instância pessoal na nuvem.
            </>,
            <>
              <B>Plus (US$ 60/mês)</B> — US$ 70 de uso incluído, modo <B>MAX</B> pra
              tarefas difíceis e instância sempre ativa — agente 24/7 na nuvem.
            </>,
            <>
              <B>Max (US$ 200/mês)</B> — US$ 400 de uso incluído, teto de on-demand
              mais alto e limites maiores pra operações pesadas.
            </>,
          ]}
        />
        <P>
          A cobrança anual dá 2 meses de desconto. Detalhes e assinatura em{" "}
          <DocLink href="/precos">work4you.ai/precos</DocLink>.
        </P>
        <H2>On-demand e limite de gasto</H2>
        <P>
          Com um plano pago ativo e cartão associado, você pode ligar o uso on-demand
          na Conta. Define um teto por ciclo (até o máximo do seu plano); o agente
          continua depois de esgotar o incluído, sem alterar a mensalidade. Acompanhe o
          medidor de <B>uso incluído</B> e o gasto on-demand estimado na mesma tela.
        </P>
        <H2>Os modos de trabalho</H2>
        <UL
          items={[
            <>
              <B>Relay 2.5 Fast</B> — modelo de casa no plano Grátis. Rápido e
              económico.
            </>,
            <>
              <B>Relay</B> — roteador inteligente nos planos pagos (Essencial+).
            </>,
            <>
              <B>MAX</B> — modelos mais fortes, pra problemas difíceis (Plus e Max).
            </>,
          ]}
        />
        <Note>
          Você acompanha o consumo do ciclo em Configurações → Conta e recebe avisos ao
          passar de 50%, 75% e 90% do uso incluído.
        </Note>
      </>
    ),
  },

  /* ============ No dia a dia ============ */
  {
    slug: "tarefas-e-sessoes",
    category: "No dia a dia",
    nav: "Tarefas e sessões",
    title: "Tarefas e sessões",
    description: "Como delegar, acompanhar, corrigir o rumo e retomar o trabalho.",
    body: (
      <>
        <P>
          Cada trabalho vive numa <B>sessão</B> — uma conversa com memória própria.
          Você pode ter várias sessões ao mesmo tempo: uma pesquisa rodando, um
          relatório em andamento, uma automação em execução. A lista fica na barra
          lateral, na seção <B>SESSÕES</B>, sempre à mão.
        </P>
        <H2>Enquanto o agente trabalha</H2>
        <UL
          items={[
            <>
              <B>Tudo visível.</B> Cada passo aparece na conversa: o site que ele
              abriu, o arquivo que criou, o comando que quer rodar.
            </>,
            <>
              <B>Mude o rumo sem recomeçar.</B> Mande uma nova instrução no meio do
              trabalho — “inclui também os concorrentes de fora do Brasil” — e ele
              ajusta a execução.
            </>,
            <>
              <B>Aprovações no seu controle.</B> No modo padrão, ações sensíveis
              pedem sua permissão. Você pode liberar por vez, pra sessão inteira, ou
              configurar quanta autonomia o agente tem.
            </>,
            <>
              <B>Perguntas quando faltar contexto.</B> Se a tarefa estiver ambígua,
              o agente pergunta antes de seguir — como um bom profissional faria.
            </>,
          ]}
        />
        <H2>Depois</H2>
        <P>
          Sessões ficam guardadas com todo o histórico e os arquivos produzidos.
          Retome de onde parou, ramifique uma conversa pra explorar outro caminho, ou
          use o buscador pra achar aquela sessão de semanas atrás.
        </P>
      </>
    ),
  },
  {
    slug: "projetos",
    category: "No dia a dia",
    nav: "Projetos",
    title: "Projetos",
    description: "Organize o trabalho por contexto — cada projeto com suas pastas e sessões.",
    body: (
      <>
        <P>
          Um <B>projeto</B> agrupa tudo que pertence ao mesmo assunto: as sessões, as
          pastas de arquivos, o contexto. Trabalhando dentro de um projeto, o agente
          conhece o material que já existe ali e não começa do zero a cada conversa.
        </P>
        <H2>Na prática</H2>
        <UL
          items={[
            <>
              Crie um projeto por cliente, por produto ou por área — como você já
              organiza seu trabalho.
            </>,
            <>
              Sessões iniciadas dentro do projeto herdam o contexto dele
              automaticamente.
            </>,
            <>
              Os arquivos do projeto ficam juntos, e o agente lê e escreve neles
              direto.
            </>,
          ]}
        />
        <Note>
          Conversas soltas continuam existindo — nem tudo precisa de projeto. Elas
          ficam em Recentes, e você pode movê-las pra um projeto quando fizer
          sentido.
        </Note>
      </>
    ),
  },
  {
    slug: "automacoes",
    category: "No dia a dia",
    nav: "Automações",
    title: "Automações",
    description: "Tarefas repetitivas que acontecem sozinhas — por horário ou por gatilho.",
    body: (
      <>
        <P>
          <B>Automações</B> são as tarefas repetitivas que o seu agente executa
          sozinho, na nuvem, sem ninguém pedir. Você define uma vez; ele cumpre
          sempre. Exemplo real, tirado da tela: <B>“Notícias Diárias de IA por
          e-mail”</B> — todos os dias às 7:00, ativa.
        </P>
        <H2>Duas formas de disparar</H2>
        <UL
          items={[
            <>
              <B>Por horário</B> — “toda segunda às 8h, resume os e-mails da semana”;
              “todo dia às 7h, manda as notícias do setor no meu e-mail”.
            </>,
            <>
              <B>Por gatilho do ambiente</B> — quando algo acontece: chegou um e-mail
              com determinado assunto, entrou um lead novo no CRM, apareceu um
              arquivo na pasta. O agente reage na hora.
            </>,
          ]}
        />
        <H2>Como criar uma automação</H2>
        <UL
          items={[
            <>
              <B>Conversando:</B> peça direto na sessão — “faz isso toda sexta às
              17h” — e o agente cria a automação.
            </>,
            <>
              <B>Pela tela Automações:</B> monte na mão, escolhendo frequência ou
              gatilho, horário e instruções.
            </>,
            <>
              <B>Por um modelo pronto:</B> automações prontas pra adaptar — resumo
              diário, monitoramento, acompanhamento de clientes.
            </>,
          ]}
        />
        <H2>O painel de execuções</H2>
        <P>
          A tela mostra, de cara, como está a saúde do seu trabalho automático:{" "}
          <B>Total de automações</B>, <B>Com sucesso (7 dias)</B> e{" "}
          <B>Com falha (7 dias)</B>. Abaixo fica o <B>Histórico de execuções</B> —
          cada rodada registrada com data, resultado e o que foi produzido. Deu erro,
          você vê exatamente onde.
        </P>
        <P>
          Cada automação aparece na lista com o resumo do agendamento e o estado —{" "}
          <B>Ativa</B> ou pausada. Os resultados chegam onde você pediu: na
          plataforma, no seu e-mail ou no seu WhatsApp, via{" "}
          <DocLink href="/documentacao/canais">Canais</DocLink>.
        </P>
        <Note>
          Automações rodam na nuvem — seu computador pode estar desligado. Do plano
          Pro pra cima, o computador do seu agente fica <B>sempre ativo</B> — ideal
          pra quem depende de gatilhos a qualquer hora.
        </Note>
      </>
    ),
  },
  {
    slug: "artefatos",
    category: "No dia a dia",
    nav: "Artefatos",
    title: "Artefatos",
    description: "Os arquivos, imagens e links que o agente cria — todos num lugar só.",
    body: (
      <>
        <P>
          <B>Artefatos</B> são as coisas de verdade que o agente cria: planilhas,
          documentos, apresentações, relatórios, imagens, páginas e links. Cada
          artefato aparece na conversa na hora, com pré-visualização no painel
          lateral — planilha abre como planilha, página abre como página.
        </P>
        <H2>A tela Artefatos</H2>
        <UL
          items={[
            <>
              Tudo que o agente produziu, organizado em pastas, com busca, itens
              recentes e favoritos.
            </>,
            <>
              Pré-visualize, baixe, renomeie e mova arquivos sem sair da plataforma.
            </>,
            <>
              Os artefatos vivem no computador do agente na nuvem — disponíveis de
              qualquer dispositivo, a qualquer hora.
            </>,
          ]}
        />
        <H2>Material seu, pro agente usar</H2>
        <P>
          O caminho também funciona ao contrário: envie arquivos pro agente
          trabalhar — uma base de clientes, um contrato pra revisar, o histórico de
          vendas. Dentro de um{" "}
          <DocLink href="/documentacao/projetos">projeto</DocLink>, esse material fica
          junto das sessões, e o agente lê e escreve nele direto.
        </P>
      </>
    ),
  },

  /* ============ Personalize ============ */
  {
    slug: "personalizar",
    category: "Personalize",
    nav: "Personalizar",
    title: "Personalizar",
    description: "O hub do seu agente: Skills, Conectores e MCPs, tudo numa tela só.",
    body: (
      <>
        <P>
          Você tem <B>um agente</B> — e a tela <B>Personalizar</B> é onde você molda
          ele. Em vez de escolher entre vários assistentes, você amplia o seu: dá
          capacidades novas, dá acesso aos seus aplicativos e liga ferramentas
          externas. Tudo em três abas: <B>Skills</B>, <B>Conectores</B> e{" "}
          <B>MCPs</B>.
        </P>
        <H2>Skills</H2>
        <P>
          Capacidades prontas pra instalar — apresentações, edição de imagem, análise
          de dados. Instalou, o agente já sabe usar. Detalhes em{" "}
          <DocLink href="/documentacao/skills">Skills</DocLink>.
        </P>
        <H2>Conectores</H2>
        <P>
          O acesso aos aplicativos que você já usa: Gmail, Drive, Sheets, Notion,
          HubSpot e mais de mil outros. Com a autorização feita, o agente lê, escreve
          e age nesses apps por você. Detalhes em{" "}
          <DocLink href="/documentacao/conectores">Conectores</DocLink>.
        </P>
        <H2>MCPs</H2>
        <P>
          Conexões avançadas para ferramentas externas. Se o sistema que você usa
          oferece um <B>servidor MCP</B>, você aponta o endereço aqui e o agente
          passa a usar as ferramentas dele como se fossem nativas. É a porta pra
          casos que fogem do catálogo pronto — normalmente indicada pelo fornecedor
          da ferramenta ou por quem cuida da TI.
        </P>
        <Note>
          Skill, conector e MCP se complementam: a <B>skill</B> ensina o agente a
          fazer algo novo; o <B>conector</B> dá acesso a um aplicativo seu; o{" "}
          <B>MCP</B> pluga uma ferramenta externa inteira. Um agente bem
          personalizado costuma usar os três.
        </Note>
      </>
    ),
  },
  {
    slug: "skills",
    category: "Personalize",
    nav: "Skills",
    title: "Skills",
    description: "Capacidades prontas pra instalar — o agente aprende na hora.",
    body: (
      <>
        <P>
          <B>Skills</B> são capacidades prontas pra usar: geração de apresentações,
          edição de imagem, análise de dados, coleta automática de informações de
          sites — instalou, o agente já sabe usar. É o jeito mais rápido de ampliar o
          que o seu agente consegue fazer. Ficam na aba <B>Skills</B>, dentro de{" "}
          <DocLink href="/documentacao/personalizar">Personalizar</DocLink>.
        </P>
        <H2>O Marketplace</H2>
        <UL
          items={[
            <>
              Clique em <B>Navegar Marketplace</B> pra ver o catálogo oficial,
              organizado por categoria, com busca e descrição do que cada skill faz.
            </>,
            <>
              Instalação em um clique — e toda skill passa por{" "}
              <B>verificação de segurança</B> antes de entrar na sua instância.
            </>,
            <>
              As essenciais já vêm instaladas. Você só adiciona o que fizer sentido
              pro seu uso.
            </>,
          ]}
        />
        <Note>
          Skill é diferente de{" "}
          <DocLink href="/documentacao/conectores">conector</DocLink>: a skill ensina
          o agente a <B>fazer</B> algo novo; o conector dá <B>acesso</B> a um
          aplicativo seu. Um agente completo geralmente combina os dois.
        </Note>
      </>
    ),
  },

  /* ============ Conexões ============ */
  {
    slug: "canais",
    category: "Conexões",
    nav: "Canais",
    title: "Canais",
    description: "Fale com o seu agente — e receba o trabalho — por onde você já conversa.",
    body: (
      <>
        <P>
          <B>Canais</B> são as portas de entrada e saída do seu agente. Conectou um
          canal, você comanda o agente por ali e recebe as entregas ali — sem
          precisar abrir a plataforma. Pediu pelo WhatsApp, de dentro do carro — a
          proposta chega ali mesmo.
        </P>
        <H2>Canais disponíveis</H2>
        <P>
          WhatsApp, Telegram, Slack, Discord, e-mail, Microsoft Teams, SMS e outros —
          são <B>dezenas de canais já integrados</B>. Cada canal funciona nos dois
          sentidos: você manda tarefa, ele devolve resultado.
        </P>
        <P>
          Alguns canais, como o WhatsApp, acordam o seu agente a qualquer hora, em
          qualquer plano. Outros — Telegram, Discord, e-mail — respondem enquanto o
          computador do agente está ativo; pra resposta garantida 24/7 neles, use do
          plano Pro pra cima, que mantém o computador <B>sempre ativo</B>.
        </P>
        <H2>Dois usos na prática</H2>
        <UL
          items={[
            <>
              <B>Você comandando de onde estiver</B> — “vê no CRM se entrou lead
              novo” mandado do celular, resposta em segundos com o resumo e os
              arquivos.
            </>,
            <>
              <B>Seus clientes no WhatsApp da empresa</B> — atendimento 24/7 com o
              conhecimento e o tom que você configurou no agente.
            </>,
          ]}
        />
        <Note>
          Configure cada canal na tela <B>Canais</B> — WhatsApp da empresa para
          clientes, Telegram ou e-mail para você mandar tarefas de onde estiver.
        </Note>
      </>
    ),
  },
  {
    slug: "conectores",
    category: "Conexões",
    nav: "Conectores",
    title: "Conectores",
    description: "Dê ao agente acesso aos aplicativos que você já usa — mais de 1.000.",
    body: (
      <>
        <P>
          <B>Conectores</B> ligam o seu agente aos seus aplicativos: Gmail, Google
          Drive, Sheets, Calendar, Notion, HubSpot, Instagram, Facebook, Google Ads e{" "}
          <B>mais de 1.000 outros</B>. Com acesso autorizado, o agente lê, escreve e
          age nesses apps por você — manda o e-mail, atualiza a planilha, publica o
          post.
        </P>
        <H2>Como conectar</H2>
        <Steps
          items={[
            <>
              Na tela <B>Conectores</B>, escolha o aplicativo e clique em conectar —
              a autorização é feita direto com o próprio app (padrão OAuth, o mesmo
              de “Entrar com Google”).
            </>,
            <>
              Ou conecte <B>no meio da conversa</B>: se uma tarefa precisa de um app
              ainda não autorizado, o agente mostra o cartão de conexão na hora.
            </>,
            <>
              Pronto — o agente passa a usar o app quando a tarefa pedir, sempre
              dentro do que você autorizou.
            </>,
          ]}
        />
        <H2>Controle fino</H2>
        <UL
          items={[
            <>
              <B>Por conversa:</B> desligue um app numa sessão específica — útil pra
              garantir que aquela tarefa não toque no seu e-mail, por exemplo.
            </>,
            <>
              <B>Na instância:</B> conectou uma vez, o agente usa em qualquer sessão
              — ou desligue só na conversa aberta, se precisar isolar.
            </>,
            <>
              <B>Revogável sempre:</B> desconectou, o acesso morre na hora.
            </>,
          ]}
        />
      </>
    ),
  },

  /* ============ Plataformas ============ */
  {
    slug: "plataformas",
    category: "Plataformas",
    nav: "Web, desktop e mais",
    title: "Onde usar a Work4You",
    description: "Um produto, várias entradas — do navegador ao WhatsApp.",
    body: (
      <>
        <H2>Web — disponível hoje</H2>
        <P>
          O jeito principal de usar:{" "}
          <DocLink href="/login">work4you.ai</DocLink> no navegador, do computador ou
          do celular. Como o agente vive na nuvem, a experiência é a mesma em
          qualquer dispositivo — e fechar o navegador não interrompe o trabalho.
        </P>
        <H2>WhatsApp e outros canais — disponível hoje</H2>
        <P>
          Conecte um <DocLink href="/documentacao/canais">canal</DocLink> e comande o
          agente sem abrir a plataforma. Pra muita gente, o WhatsApp vira a
          interface do dia a dia.
        </P>
        <H2>App pra Windows — em preparação</H2>
        <P>
          O aplicativo pra Windows está em preparação: a mesma plataforma, com
          integração mais profunda com a sua máquina.
        </P>
        <H2>Linha de comando — em preparação</H2>
        <P>
          Pra quem trabalha com código: o agente no seu terminal, operando no seu
          repositório — corrigindo bugs, abrindo PRs, rodando testes — com os mesmos
          modelos e o mesmo controle de aprovações.
        </P>
        <Note>
          Acompanhe o <DocLink href="/blog">Blog</DocLink> e a{" "}
          <DocLink href="/comunidade">Comunidade</DocLink> pra saber quando cada
          plataforma ficar disponível.
        </Note>
      </>
    ),
  },
];

export function docBySlug(slug: string): DocPage | undefined {
  return DOCS.find((d) => d.slug === slug);
}
