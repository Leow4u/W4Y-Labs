import type { ReactNode } from "react";
import Link from "next/link";

// EN blog registry (mirror of posts.tsx) — ordered newest first (index features POSTS[0]).
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
    category: "How to",
    title: "From your first task to a routine that runs itself",
    description:
      "The path our best users take in their first week — in four steps.",
    date: "July 25, 2026",
    dateISO: "2026-07-25",
    readingMinutes: 4,
    body: (
      <>
        <P>
          There's a pattern among the people who get the most out of Work4You:
          they start small, connect the essentials, and turn what works into a
          routine. The whole path fits in one week. Here it is, in four steps.
        </P>
        <H2>1. One research task</H2>
        <P>
          Start with something you'd keep putting off: “research the 10 biggest
          competitors in my industry and build a spreadsheet comparing price and
          value proposition.” It's the kind of task that shows the agent at work —
          browsing, organizing, delivering a file — without depending on any
          connection.
        </P>
        <H2>2. Connect 2 or 3 apps</H2>
        <P>
          Now give it access to what you use every day: Gmail, Google Drive, your
          CRM, your Instagram. Authorization happens with the app itself (the same
          pattern as “Sign in with Google”) and can be revoked whenever you want.
          With access, the agent stops just producing — it starts to <B>act</B>:
          sending, updating, publishing.
        </P>
        <H2>3. Approve — and adjust course</H2>
        <P>
          On your first tasks, the agent will ask for your approval before
          sensitive actions. Make the most of it: that's where you calibrate
          trust and teach it your preferences, sending instructions mid-task.
          Before long you'll know exactly how much autonomy to give.
        </P>
        <H2>4. Turn it into a routine</H2>
        <P>
          Task went well? Say: “do this every Monday at 8 a.m.” Done — it goes
          into the <PostLink href="/documentacao/agenda">Agenda</PostLink> and
          starts happening without you, with the delivery arriving wherever you
          asked: on the platform, by email, on WhatsApp.
        </P>
        <P>
          That's the moment the agent stops being a tool you use and becomes{" "}
          <B>part of the team</B>. The full walkthrough is in{" "}
          <PostLink href="/documentacao/primeiros-passos">
            Getting started
          </PostLink>
          .
        </P>
      </>
    ),
  },
  {
    slug: "agent-studio-funcionarios-digitais",
    category: "Product",
    title: "Agent Studio: build digital employees with a defined role",
    description:
      "No more “one AI for everything.” Now you build agents made to measure — with knowledge, limits, and even a support team.",
    date: "June 18, 2026",
    dateISO: "2026-06-18",
    readingMinutes: 4,
    body: (
      <>
        <P>
          From day one, Work4You has been about real delegation. But delegating
          well requires something a “generic AI” doesn't have: <B>a defined
          role</B>. A company doesn't hire one person to do everything — it hires
          a salesperson, a support rep, an analyst. Starting now, your agents
          work that way too.
        </P>
        <H2>The Agent Studio</H2>
        <P>
          In the <B>Agent Studio</B>, you build made-to-measure agents{" "}
          <B>by talking</B>: describe the role — “I want an agent that runs my
          Instagram: replies to comments and preps 3 posts a week” — and the
          Studio turns that into a draft with editable fields. In a hurry? Start
          from a ready-made template.
        </P>
        <H2>Each agent gets its own</H2>
        <P>
          <B>Its own knowledge:</B> upload documents — catalog, pricing policy,
          history — and the agent starts consulting and citing that material in
          any task. <B>A credit cap:</B> set how much each agent can spend per
          month; when it hits the cap, it stops. <B>Its own channels and
          apps:</B> the support agent on the company WhatsApp, the reports agent
          with access to Drive — each one only sees what you gave it.
        </P>
        <H2>And for big jobs, a goal</H2>
        <P>
          Hand over a goal — “launch the campaign for product X” — and the agent
          proposes the plan: steps, order, who does what. You review, approve,
          and the work moves forward with approvals centralized in one place. The
          full guide is in the{" "}
          <PostLink href="/documentacao/agent-studio">documentation</PostLink>.
        </P>
      </>
    ),
  },
  {
    slug: "agenda-rotinas-24-7",
    category: "Product",
    title: "Agenda: the day your agent got commitments",
    description:
      "Recurring routines that happen on their own — every day, every week, at the time you set.",
    date: "May 14, 2026",
    dateISO: "2026-05-14",
    readingMinutes: 3,
    body: (
      <>
        <P>
          Delegating a task is good. Never having to delegate that task again is
          better. With the <B>Agenda</B>, your agent gains commitments: “every
          Monday at 8 a.m., summarize the week's emails,” “every day at 6 p.m.,
          check the CRM for new leads and ping me on WhatsApp.” You set it once;
          it follows through every time.
        </P>
        <H2>Three ways to create a routine</H2>
        <P>
          <B>By talking</B> — ask right in the session: “do this every Friday at
          5 p.m.” <B>From the Agenda screen</B> — setting frequency, time, and
          instructions. <B>From the template gallery</B> — ready-made routines to
          adapt: daily summary, monitoring, client follow-up.
        </P>
        <H2>In the cloud, not in your browser</H2>
        <P>
          Routines run on the agent's computer, in the cloud — yours can be off.
          Every run is logged with its result, and the delivery arrives wherever
          you ask: on the platform, by email, on WhatsApp. The{" "}
          <B>Calendar</B> shows everything that's scheduled, including when you
          have more than one agent.
        </P>
        <P>
          It's the piece that was missing for “24-hour employee” to stop being a
          figure of speech. Details in{" "}
          <PostLink href="/documentacao/agenda">Agenda and routines</PostLink>.
        </P>
      </>
    ),
  },
  {
    slug: "conectores-mil-aplicativos",
    category: "Product",
    title: "Over 1,000 apps, one agent",
    description:
      "Gmail, Drive, CRM, Instagram, Google Ads — your agent now acts inside the tools you already use.",
    date: "April 2, 2026",
    dateISO: "2026-04-02",
    readingMinutes: 3,
    body: (
      <>
        <P>
          An agent that only produces text still leaves the final work with you:
          copy, paste, send, publish. <B>Connectors</B> close that last mile —
          with authorized access, the agent <B>acts</B> in your apps: sends the
          email, updates the spreadsheet, logs it in the CRM, publishes the post.
        </P>
        <H2>Over 1,000 apps, one-click authorization</H2>
        <P>
          Gmail, Google Drive, Sheets, Calendar, Notion, HubSpot, Instagram,
          Facebook, Google Ads, and a thousand-plus others. Authorization happens
          directly with the app itself (the OAuth standard, the same one behind
          “Sign in with Google”) — and if a task needs an app you haven't
          connected yet, the agent shows the connection card{" "}
          <B>right in the conversation</B>.
        </P>
        <H2>Fine-grained control, always</H2>
        <P>
          Each agent only sees the apps you gave it. You can turn an app off in a
          specific conversation — useful when a task shouldn't touch your email.
          And once you disconnect, access dies on the spot. The guide is in{" "}
          <PostLink href="/documentacao/conectores">Connectors</PostLink>.
        </P>
      </>
    ),
  },
{
    slug: "seu-agente-no-whatsapp",
    category: "Product",
    title: "Your agent now answers on WhatsApp",
    description:
      "Channels are here: send tasks and get deliveries where you already chat — without opening the platform.",
    date: "February 25, 2026",
    dateISO: "2026-02-25",
    readingMinutes: 3,
    body: (
      <>
        <P>
          The best place for your agent is wherever you already are. With{" "}
          <B>Channels</B>, you connect WhatsApp — plus Telegram, Slack, Discord,
          email, Microsoft Teams, SMS, and more — and start running your agent
          from there, without opening the platform.
        </P>
        <H2>It works both ways</H2>
        <P>
          Every channel runs in both directions: you send “check the CRM for new
          leads” from your phone, and the answer comes back in seconds — with a
          summary and files. Ask for a proposal from your car, and the proposal
          lands right there, as a PDF.
        </P>
        <H2>And your customers too</H2>
        <P>
          The use case that excited us most in testing: a <B>customer support</B>{" "}
          agent on your company&apos;s WhatsApp, answering with the knowledge you
          gave it. Channels can belong to the whole account or to a specific
          agent — the support agent has its own number, your personal agent has
          yours.
        </P>
        <P>
          How to connect, what works on each plan, and best practices:{" "}
          <PostLink href="/documentacao/canais">Channels, in the docs</PostLink>.
        </P>
      </>
    ),
  },
  {
    slug: "por-que-somos-agnosticos-de-modelo",
    category: "Vision",
    title: "Why we don't lock you into one AI model",
    description:
      "The model race changes every week. Your operation can't depend on betting on the right horse.",
    date: "January 20, 2026",
    dateISO: "2026-01-20",
    readingMinutes: 3,
    body: (
      <>
        <P>
          In a single year, the title of “best AI model in the world” changed
          hands several times. Every release reshuffles the podium — in
          reasoning, in writing, in code, in price. If you follow the field,
          it&apos;s fascinating. If you have a business to run, it&apos;s noise.
        </P>
        <P>
          That&apos;s why Work4You was born <B>model-agnostic</B>: your agent
          isn&apos;t hostage to a single vendor. It uses the leading models on
          the market, and when the podium shifts again, you benefit without
          migrating anything.
        </P>
        <H2>Auto: the right choice for each task</H2>
        <P>
          Models have different profiles. Using the most expensive one for every
          task is wasteful; using the cheapest for everything gets weak results.{" "}
          <B>Auto</B> mode analyzes each task and routes it to the best-suited
          model, balancing quality and cost. A quick lookup doesn&apos;t pay
          deep-reasoning prices — and a hard problem never lands on a weak
          model.
        </P>
        <H2>And control stays yours</H2>
        <P>
          Prefer a specific model? Just pick it — the selector is one click away
          when you delegate. Full transparency: you always know which model did
          the work. Details in{" "}
          <PostLink href="/documentacao/planos-e-creditos">
            Plans and credits
          </PostLink>
          .
        </P>
      </>
    ),
  },
  {
    slug: "apresentando-a-work4you",
    category: "Product",
    title: "Introducing Work4You",
    description:
      "An AI agent with its own cloud computer that works for you — and an invitation to our early access.",
    date: "December 10, 2025",
    dateISO: "2025-12-10",
    readingMinutes: 4,
    body: (
      <>
        <P>
          Every week a new AI shows up that chats better. But chatting was never
          the bottleneck for entrepreneurs. The bottleneck is the work that
          piles up while you chat: the spreadsheet that needs to exist, the
          proposal that needs to go out, the customer waiting for a reply, the
          post that needs to be published.
        </P>
        <P>
          Work4You was built to attack that bottleneck. We didn&apos;t build
          another chat — we built an <B>agent with its own computer in the
          cloud</B>. It browses, researches, writes, works spreadsheets,
          accesses the apps you authorize, and hands back <B>finished work</B>:
          the file, the published post, the sent email.
        </P>
        <H2>What that changes in practice</H2>
        <P>
          You delegate the way you&apos;d delegate to a person: “research the
          competitors and build a comparison”, “prepare 3 posts for the week”,
          “check for new leads and let me know”. The agent works step by step,
          in plain sight, asking for approval before any sensitive action. And
          when a task works out, it can become recurring — the agent starts
          doing it on its own, with your computer switched off.
        </P>
        <H2>Without betting on a single AI model</H2>
        <P>
          Inside Work4You you use the leading models on the market, and{" "}
          <B>Auto</B> mode picks the best fit for each task, balancing quality
          and cost. We believe your operation can&apos;t depend on betting on
          the right vendor — we&apos;ll have more to say about that.
        </P>
        <H2>We&apos;re in early access</H2>
        <P>
          Work4You is open in early access: a smaller group of users, real
          closeness to the team, and evolution guided by the people using it.
          The Free plan doesn&apos;t ask for a card —{" "}
          <PostLink href="/login">create your account</PostLink> and delegate
          your first task. The <PostLink href="/documentacao">docs</PostLink>{" "}
          show the way.
        </P>
      </>
    ),
  },
];

export function postBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
