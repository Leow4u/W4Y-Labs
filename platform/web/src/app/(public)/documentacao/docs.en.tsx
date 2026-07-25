import type { ReactNode } from "react";
import Link from "next/link";

// EN documentation registry (mirror of docs.tsx) — single source for the index, the sidebar
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
  "Start here",
  "Day to day",
  "Build",
  "Connections",
  "Platforms",
] as const;

export const DOCS: DocPage[] = [
{
    slug: "o-que-e",
    category: "Start here",
    nav: "What is Work4You",
    title: "What is Work4You",
    description:
      "An AI agent with its own cloud computer that works for you and delivers the finished result.",
    body: (
      <>
        <P>
          Work4You is a platform where you <B>build your own AI agent</B> and put
          it to work. Unlike a regular chat, your agent has a{" "}
          <B>computer of its own in the cloud</B>: it browses the web, works on
          spreadsheets, writes documents, uses the apps you authorize, and hands
          the work back finished — not just an answer.
        </P>
        <H2>How it works</H2>
        <P>
          You describe what you need, in plain English, the way you would with
          someone on your team. The agent builds a plan, executes step by step,
          and shows everything in real time. When an action is sensitive —
          running a command, publishing something — it{" "}
          <B>asks for your approval first</B>.
        </P>
        <H2>All the best models, in one place</H2>
        <P>
          Work4You doesn’t lock you into one AI model. <B>Auto</B> mode looks at
          each task and routes it to the best-suited model, balancing quality and
          cost. If you prefer, pick manually from the market’s leading models,
          like Opus 5, Sonnet 5, GPT-5.6 Sol, and Grok 4.5.
        </P>
        <H2>The work goes on without you</H2>
        <P>
          Your agent lives in the cloud, not in your browser. You can close the
          tab or shut down your computer — it keeps working and lets you know
          when it’s done. With the{" "}
          <DocLink href="/documentacao/agenda">Agenda</DocLink>, it also runs
          recurring routines without anyone having to ask.
        </P>
        <Note>
          Every customer gets a <B>dedicated instance</B>: your agent, your
          files, and your memory live in an environment that’s yours alone,
          separate from everyone else’s.
        </Note>
      </>
    ),
  },
  {
    slug: "primeiros-passos",
    category: "Start here",
    nav: "Getting started",
    title: "Getting started",
    description: "From new account to first delivered task, in just a few minutes.",
    body: (
      <>
        <Steps
          items={[
            <>
              <B>Create your account</B> at{" "}
              <DocLink href="/login">work4you.ai/login</DocLink> — with Google or
              email and password. The Free plan doesn’t ask for a card.
            </>,
            <>
              <B>Describe your first task</B> in the message box. Be specific,
              like you would with a new hire: what you want, by when, in what
              format. Example: “Research the 10 biggest competitors in [your
              industry] and build a spreadsheet comparing pricing and value
              propositions.”
            </>,
            <>
              <B>Follow along in real time.</B> The agent shows every step — what
              it’s reading, what it’s doing. You can step in at any moment with a
              new instruction, without starting over.
            </>,
            <>
              <B>Approve when it asks.</B> Sensitive actions come with an
              approval request. You decide: allow once, always allow, or deny.
            </>,
            <>
              <B>Get the delivery.</B> Spreadsheets, documents, and presentations
              show up in the conversation ready to open, preview, and download.
            </>,
          ]}
        />
        <H2>Tips for your first week</H2>
        <UL
          items={[
            <>
              Start with research and organization tasks — they’re quick and show
              how the agent works.
            </>,
            <>
              Connect 2 or 3 apps you use every day (Gmail, Google Drive,
              WhatsApp) on the{" "}
              <DocLink href="/documentacao/conectores">Connectors</DocLink>{" "}
              screen.
            </>,
            <>
              When a task works out, turn it into a routine in the{" "}
              <DocLink href="/documentacao/agenda">Agenda</DocLink> — the agent
              starts doing it on its own, at the time you set.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    slug: "planos-e-creditos",
    category: "Start here",
    nav: "Plans and credits",
    title: "Plans and credits",
    description: "How billing works: monthly credits, no surprises at the end of the month.",
    body: (
      <>
        <P>
          Every plan includes an amount of <B>credits per month</B>. Credits are
          the agent’s working currency: each task consumes them based on effort —
          a quick question costs little; a long research job with a spreadsheet
          at the end costs more. Out of credits for the month? The agent stops
          and lets you know. <B>There’s never a surprise charge.</B>
        </P>
        <H2>The plans</H2>
        <UL
          items={[
            <>
              <B>Free</B> — to get to know the platform. No credit card.
            </>,
            <>
              <B>Starter ($19/month)</B> — 600 credits, the essential modes
              (Flash and Auto), and your personal cloud instance.
            </>,
            <>
              <B>Pro ($49/month)</B> — 1,600 credits, <B>Expert</B> mode for hard
              tasks, and an always-on instance: your 24-hour employee.
            </>,
            <>
              <B>Max ($99/month)</B> — 3,800 credits and <B>Crew</B> mode: a team
              of agents working in parallel on the same goal.
            </>,
          ]}
        />
        <P>
          Paid plans start with <B>7 days free</B>, and annual billing gets you 2
          months off. Details and sign-up at{" "}
          <DocLink href="/precos">work4you.ai/precos</DocLink>.
        </P>
        <H2>The work modes</H2>
        <UL
          items={[
            <>
              <B>Flash</B> — fast answers, minimal cost. Great for everyday
              tasks.
            </>,
            <>
              <B>Auto</B> — the smart default: routes each task to the best
              model, balancing quality and cost.
            </>,
            <>
              <B>Expert</B> — the strongest models, for hard problems (on the Pro
              and Max plans).
            </>,
            <>
              <B>Crew</B> — several agents in parallel, coordinated (on the Max
              plan).
            </>,
          ]}
        />
        <Note>
          You can track the month’s usage inside the platform, and you get a
          heads-up when you cross 50%, 75%, and 90% of your credits.
        </Note>
      </>
    ),
  },
  {
    slug: "tarefas-e-sessoes",
    category: "Day to day",
    nav: "Tasks and sessions",
    title: "Tasks and sessions",
    description: "How to delegate, follow along, course-correct, and pick work back up.",
    body: (
      <>
        <P>
          Every piece of work lives in a <B>session</B> — a conversation with its
          own memory. You can have several sessions going at once: a research job
          running, a report in progress, a scheduled routine. The list sits in
          the sidebar, always within reach.
        </P>
        <H2>While the agent works</H2>
        <UL
          items={[
            <>
              <B>Everything visible.</B> Every step shows up in the conversation:
              the site it opened, the file it created, the command it wants to
              run.
            </>,
            <>
              <B>Change course without starting over.</B> Send a new instruction
              mid-task — “include international competitors too” — and it adjusts
              the execution.
            </>,
            <>
              <B>Approvals under your control.</B> In the default mode, sensitive
              actions ask for your permission. You can allow them one at a time,
              allow them for the whole session, or configure how much autonomy
              the agent has.
            </>,
            <>
              <B>Questions when context is missing.</B> If a task is ambiguous,
              the agent asks before moving on — like a good professional would.
            </>,
          ]}
        />
        <H2>Afterward</H2>
        <P>
          Sessions are kept with the full history and every file produced. Pick
          up where you left off, branch a conversation to explore another path,
          or use search to find that session from weeks ago.
        </P>
      </>
    ),
  },
  {
    slug: "projetos",
    category: "Day to day",
    nav: "Projects",
    title: "Projects",
    description: "Organize work by context — each project with its own folders and sessions.",
    body: (
      <>
        <P>
          A <B>project</B> groups everything that belongs to the same subject:
          the sessions, the file folders, the context. Working inside a project,
          the agent knows the material that’s already there and doesn’t start
          from scratch with every conversation.
        </P>
        <H2>In practice</H2>
        <UL
          items={[
            <>
              Create a project per client, per product, or per area — however you
              already organize your work.
            </>,
            <>
              Sessions started inside a project inherit its context
              automatically.
            </>,
            <>
              The project’s files stay together, and the agent reads and writes
              them directly.
            </>,
          ]}
        />
        <Note>
          Standalone conversations still exist — not everything needs a project.
          They live in Recents, and you can move them into a project whenever it
          makes sense.
        </Note>
      </>
    ),
  },
  {
    slug: "agenda",
    category: "Day to day",
    nav: "Agenda and routines",
    title: "Agenda and routines",
    description: "Recurring work that happens on its own — without depending on you.",
    body: (
      <>
        <P>
          The <B>Agenda</B> is where your agent takes on commitments. A routine
          is a task with a schedule: “every Monday at 8 a.m., summarize the
          week’s emails,” “every day at 6 p.m., check the CRM for new leads and
          message me on WhatsApp.” You set it once; the agent delivers every
          time.
        </P>
        <H2>How to create a routine</H2>
        <UL
          items={[
            <>
              <B>By talking:</B> ask right in the session — “do this every Friday
              at 5 p.m.” — and the agent schedules it.
            </>,
            <>
              <B>From the Agenda:</B> build the routine on screen, choosing the
              frequency, time, and instructions.
            </>,
            <>
              <B>From the template gallery:</B> ready-made routines to adapt —
              daily digest, monitoring, client follow-up.
            </>,
          ]}
        />
        <H2>Keeping track</H2>
        <P>
          The <B>Calendar</B> shows everything that’s scheduled, including when
          you have more than one agent. Every run is logged with its result — and
          deliveries arrive wherever you asked: on the platform, in your email,
          or on your WhatsApp, via{" "}
          <DocLink href="/documentacao/canais">Channels</DocLink>.
        </P>
        <Note>
          Routines run in the cloud — your computer can be off. On the Pro plan
          and up, your agent’s computer stays <B>always on</B> — ideal for a full
          schedule.
        </Note>
      </>
    ),
  },
{
    slug: "entregas-e-arquivos",
    category: "Day to day",
    nav: "Deliveries and files",
    title: "Deliveries and files",
    description: "Where everything your agent produces lives — and the material you give it.",
    body: (
      <>
        <P>
          Your agent’s work comes back as <B>real files</B>: spreadsheets,
          documents, presentations, reports, pages. Every delivery shows up in the
          conversation right away, with a preview in the side panel — a spreadsheet
          opens as a spreadsheet, a page opens as a page.
        </P>
        <H2>The Deliveries screen</H2>
        <UL
          items={[
            <>
              Everything your agent has produced, organized in folders, with
              search, recent files, and favorites.
            </>,
            <>
              Preview, download, rename, and move files without leaving the platform.
            </>,
            <>
              Files live on your agent’s cloud computer — available from any
              device, at any time.
            </>,
          ]}
        />
        <H2>Your material, for the agent to use</H2>
        <P>
          It works the other way too: send files for your agent to work
          with — a customer database, a contract to review, your sales
          history. And in{" "}
          <DocLink href="/documentacao/agent-studio">Agent Studio</DocLink>, you
          build your agent’s permanent <B>knowledge</B> base: documents it
          consults and cites in any task.
        </P>
      </>
    ),
  },
  {
    slug: "agent-studio",
    category: "Build",
    nav: "Agent Studio",
    title: "Agent Studio",
    description: "Build agents to spec: role, knowledge, limits, and team.",
    body: (
      <>
        <P>
          <B>Agent Studio</B> is where you stop having “an AI” and start having{" "}
          <B>digital employees with defined roles</B>: a prospecting agent,
          a customer service agent, a reporting agent — each with its own
          instructions, knowledge, and limits.
        </P>
        <H2>Creating an agent</H2>
        <P>
          Start by <B>talking</B>: describe the role — “I want an agent that runs
          my Instagram: replies to comments and preps 3 posts a week” — and the
          Studio drafts it with editable fields. Or start from a{" "}
          <B>ready-made template</B> and adjust.
        </P>
        <H2>What each agent can have</H2>
        <UL
          items={[
            <>
              <B>Its own knowledge</B> — upload documents (PDF, Word, Excel,
              spreadsheets, text) and the agent starts consulting and citing that material.
            </>,
            <>
              <B>A credit cap</B> — set how much each agent can spend per
              month. When it hits the cap, it stops. You control what each one spends.
            </>,
            <>
              <B>Its own Channels and apps</B> — the customer service agent on
              WhatsApp; the reporting agent with Drive access. Each with its own.
            </>,
            <>
              <B>A support team</B> — an agent can get supporting roles
              working alongside it, like a small team.
            </>,
          ]}
        />
        <H2>Delegating a goal</H2>
        <P>
          For big jobs, hand over a <B>goal</B> — “launch the campaign for
          product X” — and the agent proposes the plan: the steps, the order, who does what.
          You review, you approve, and the team executes. Progress stays visible in real
          time, with approvals centralized in one place.
        </P>
      </>
    ),
  },
  {
    slug: "habilidades",
    category: "Build",
    nav: "Skills",
    title: "Skills",
    description: "Ready-to-install capabilities — your agent learns them on the spot.",
    body: (
      <>
        <P>
          <B>Skills</B> are ready-to-use capabilities: presentation
          generation, image editing, data analysis, automatic collection of
          information from websites — install one, and your agent already knows how to use it.
          It’s the fastest way to expand what your agent can do.
        </P>
        <H2>The marketplace</H2>
        <UL
          items={[
            <>
              An official catalog organized by category, with search and a description of what
              each skill does.
            </>,
            <>
              One-click install — and every skill goes through a{" "}
              <B>security check</B> before it enters your instance.
            </>,
            <>
              The essentials come pre-installed. You only add what makes sense
              for how you work.
            </>,
          ]}
        />
        <Note>
          A skill is different from a{" "}
          <DocLink href="/documentacao/conectores">connector</DocLink>: a skill
          teaches your agent to <B>do</B> something new; a connector gives it <B>access</B> to an
          app of yours. A complete agent usually combines both.
        </Note>
      </>
    ),
  },
  {
    slug: "canais",
    category: "Connections",
    nav: "Channels",
    title: "Channels",
    description: "Talk to your agent — and get the work back — wherever you already chat.",
    body: (
      <>
        <P>
          <B>Channels</B> are your agent’s doors in and out. Connect a
          channel and you can direct your agent from there and receive deliveries there — no
          need to open the platform. Ask from WhatsApp, from inside your car — the
          proposal lands right there.
        </P>
        <H2>Available channels</H2>
        <P>
          WhatsApp, Telegram, Slack, Discord, email, Microsoft Teams, SMS, and more —
          that’s <B>dozens of channels already integrated</B>. Every channel works both
          ways: you send a task, it sends back the result.
        </P>
        <P>
          Some channels, like WhatsApp, wake your agent at any hour, on
          any plan. Others — Telegram, Discord, email — respond while your agent’s
          computer is active; for guaranteed 24/7 replies on those, use the
          Pro plan or above, which keeps the computer <B>always on</B>.
        </P>
        <H2>Two uses in practice</H2>
        <UL
          items={[
            <>
              <B>You directing from anywhere</B> — “check the CRM for new
              leads” sent from your phone, an answer in seconds with the summary and the
              files.
            </>,
            <>
              <B>Your customers talking to your agent</B> — a customer
              service agent on your company’s WhatsApp, answering 24/7 with the
              knowledge you gave it.
            </>,
          ]}
        />
        <Note>
          Channels can be global (covering your whole instance) or per agent — the
          customer service agent has its own number, your personal agent has yours.
          Set it up on the <B>Channels</B> screen.
        </Note>
      </>
    ),
  },
  {
    slug: "conectores",
    category: "Connections",
    nav: "Connectors",
    title: "Connectors",
    description: "Give your agent access to the apps you already use — over 1,000 of them.",
    body: (
      <>
        <P>
          <B>Connectors</B> link your agent to your apps: Gmail, Google
          Drive, Sheets, Calendar, Notion, HubSpot, Instagram, Facebook, Google Ads, and{" "}
          <B>over 1,000 others</B>. With authorized access, your agent reads, writes, and
          acts in those apps for you — sends the email, updates the spreadsheet, publishes the
          post.
        </P>
        <H2>How to connect</H2>
        <Steps
          items={[
            <>
              On the <B>Connectors</B> screen, pick the app and click connect —
              authorization happens directly with the app itself (standard OAuth, the same
              as “Sign in with Google”).
            </>,
            <>
              Or connect <B>mid-conversation</B>: if a task needs an app
              you haven’t authorized yet, the agent shows the connection card right there.
            </>,
            <>
              That’s it — your agent uses the app whenever a task calls for it, always
              within what you authorized.
            </>,
          ]}
        />
        <H2>Fine-grained control</H2>
        <UL
          items={[
            <>
              <B>Per conversation:</B> turn an app off in a specific session — useful to
              make sure that one task doesn’t touch your email, for example.
            </>,
            <>
              <B>Per agent:</B> each agent only sees the apps you gave it.
            </>,
            <>
              <B>Revocable any time:</B> disconnect, and access dies on the spot.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    slug: "plataformas",
    category: "Platforms",
    nav: "Web, desktop, and more",
    title: "Where to use Work4You",
    description: "One product, many ways in — from the browser to WhatsApp.",
    body: (
      <>
        <H2>Web — available today</H2>
        <P>
          The main way to use it:{" "}
          <DocLink href="/login">work4you.ai</DocLink> in the browser, on your computer or
          your phone. Since your agent lives in the cloud, the experience is the same on
          any device — and closing the browser doesn’t interrupt the work.
        </P>
        <H2>WhatsApp and other channels — available today</H2>
        <P>
          Connect a <DocLink href="/documentacao/canais">channel</DocLink> and direct your
          agent without opening the platform. For a lot of people, WhatsApp becomes the
          everyday interface.
        </P>
        <H2>Windows app — in the works</H2>
        <P>
          The Windows app is in the works: the same platform, with
          deeper integration with your machine.
        </P>
        <H2>Command line — in the works</H2>
        <P>
          For people who work with code: your agent in your terminal, operating on your
          repository — fixing bugs, opening PRs, running tests — with the same
          models and the same approval controls.
        </P>
        <Note>
          Follow the <DocLink href="/blog">Blog</DocLink> and the{" "}
          <DocLink href="/comunidade">Community</DocLink> to hear when each
          platform becomes available.
        </Note>
      </>
    ),
  },
];

export function docBySlug(slug: string): DocPage | undefined {
  return DOCS.find((d) => d.slug === slug);
}
