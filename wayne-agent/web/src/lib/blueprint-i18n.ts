/**
 * blueprint-i18n — pt-BR overlay for native automation blueprints (PR-8 C6).
 * Backend catalog stays EN; the dashboard localizes titles, descriptions,
 * and field labels for PME copy without a server change.
 */
import type { AutomationBlueprint, AutomationBlueprintField } from "@/lib/api";

export const FEATURED_BLUEPRINT_KEYS = [
  "morning-brief",
  "important-mail",
  "weekly-review",
  "bill-renewal-watch",
  "news-digest",
  "meal-plan",
  "workday-start",
  "evening-winddown",
] as const;

export const MORE_BLUEPRINT_KEYS = [
  "custom-reminder",
  "habit-checkin",
  "hydration-move",
  "learn-daily",
  "gratitude-journal",
  "on-this-day",
] as const;

type FieldOverlay = { label?: string; help?: string; default?: string; options?: Record<string, string> };
type BlueprintOverlay = {
  title?: string;
  description?: string;
  fields?: Record<string, FieldOverlay>;
};

const PT_OVERLAY: Record<string, BlueprintOverlay> = {
  "morning-brief": {
    title: "Briefing matinal",
    description:
      "Um resumo curto do dia: agenda, clima e o que precisa da sua atenção.",
    fields: { time: { label: "Que horas?" }, deliver: { label: "Onde entregar?" } },
  },
  "important-mail": {
    title: "Monitor de e-mail importante",
    description:
      "Verifica sua caixa de entrada e avisa só sobre mensagens que realmente importam.",
    fields: {
      interval_min: { label: "Com que frequência?", help: "minutos entre verificações" },
      criteria: {
        label: "Avise-me apenas se o e-mail…",
        default: "precisa de resposta hoje, é do meu gestor ou da família, ou menciona um prazo",
      },
      deliver: { label: "Onde entregar?" },
    },
  },
  "weekly-review": {
    title: "Revisão semanal",
    description: "Recapitulação da semana: o que foi feito, o que ficou aberto e o que vem aí.",
    fields: {
      time: { label: "Que horas?" },
      day: {
        label: "Qual dia?",
        options: {
          sunday: "domingo",
          monday: "segunda",
          friday: "sexta",
          saturday: "sábado",
        },
      },
      deliver: { label: "Onde entregar?" },
    },
  },
  "workday-start": {
    title: "Início do dia de trabalho",
    description: "Um lembrete em dias úteis com sua agenda e prioridades do dia.",
    fields: { time: { label: "Que horas?" }, deliver: { label: "Onde entregar?" } },
  },
  "custom-reminder": {
    title: "Lembrete personalizado",
    description: "Um lembrete recorrente nas suas palavras, no horário que você escolher.",
    fields: {
      what: { label: "Lembre-me de…", default: "fazer uma pausa e alongar" },
      time: { label: "Que horas?" },
      recurrence: {
        label: "Repetir em",
        options: {
          everyday: "todos os dias",
          weekdays: "dias úteis",
          weekends: "fins de semana",
          monday: "segunda",
          tuesday: "terça",
          wednesday: "quarta",
          thursday: "quinta",
          friday: "sexta",
          saturday: "sábado",
          sunday: "domingo",
        },
      },
      deliver: { label: "Onde entregar?" },
    },
  },
  "evening-winddown": {
    title: "Encerramento do dia",
    description:
      "Check-in no fim do dia: agenda de amanhã e o que vale preparar ainda hoje.",
    fields: { time: { label: "Que horas?" }, deliver: { label: "Onde entregar?" } },
  },
  "news-digest": {
    title: "Resumo de notícias por tema",
    description:
      "Um digest periódico sobre um tema — só o que for novo desde a última execução.",
    fields: {
      topic: { label: "Qual tema?", default: "IA e tecnologia", help: "assunto, produto, pessoa ou busca" },
      time: { label: "Que horas?" },
      recurrence: {
        label: "Repetir em",
        options: {
          everyday: "todos os dias",
          weekdays: "dias úteis",
          weekends: "fins de semana",
        },
      },
      count: { label: "Quantos tópicos?", options: { "3": "3", "5": "5", "8": "8" } },
      deliver: { label: "Onde entregar?" },
    },
  },
  "bill-renewal-watch": {
    title: "Contas e renovações",
    description:
      "Aviso antes de um pagamento recorrente ou vencimento — nada renova surpresa.",
    fields: {
      what: {
        label: "O que vence?",
        default: "minha assinatura de streaming renova em breve",
      },
      time: { label: "Que horas?" },
      recurrence: {
        label: "Repetir em",
        options: { everyday: "todos os dias", weekdays: "dias úteis" },
      },
      deliver: { label: "Onde entregar?" },
    },
  },
  "habit-checkin": {
    title: "Check-in de hábito",
    description: "Lembrete gentil para manter um hábito e refletir se você cumpriu.",
    fields: {
      habit: { label: "Qual hábito?", default: "20 minutos de leitura" },
      time: { label: "Que horas?" },
      recurrence: { label: "Repetir em", options: { everyday: "todos os dias", weekdays: "dias úteis" } },
      deliver: { label: "Onde entregar?" },
    },
  },
  "hydration-move": {
    title: "Água e movimento",
    description: "Lembrete periódico para beber água, levantar e alongar.",
    fields: {
      interval_hours: { label: "Com que frequência?", help: "horas entre lembretes" },
      start_hour: { label: "Hora inicial", help: "primeira hora da janela (24h)" },
      end_hour: { label: "Hora final", help: "última hora da janela (24h)" },
      deliver: { label: "Onde entregar?" },
    },
  },
  "meal-plan": {
    title: "Plano de refeições semanal",
    description: "Cardápio da semana + lista de compras, ajustado à sua dieta e tempo.",
    fields: {
      diet: {
        label: "Dieta?",
        options: {
          "no restrictions": "sem restrições",
          vegetarian: "vegetariana",
          vegan: "vegana",
          "high-protein": "rica em proteína",
          "low-carb": "baixo carboidrato",
        },
      },
      meals: {
        label: "Refeições por dia?",
        options: {
          "dinner only": "só jantar",
          "lunch and dinner": "almoço e jantar",
          "all three": "café, almoço e jantar",
        },
      },
      effort: {
        label: "Esforço na cozinha?",
        options: { quick: "rápido", medium: "médio", ambitious: "ambicioso" },
      },
      time: { label: "Que horas?" },
      day: {
        label: "Qual dia?",
        options: { sunday: "domingo", monday: "segunda", friday: "sexta", saturday: "sábado" },
      },
      deliver: { label: "Onde entregar?" },
    },
  },
  "learn-daily": {
    title: "Aprendizado diário",
    description: "Uma lição curta por dia sobre um tema, evoluindo ao longo do tempo.",
    fields: {
      topic: { label: "Aprender sobre…", default: "vocabulário de espanhol" },
      time: { label: "Que horas?" },
      recurrence: { label: "Repetir em", options: { weekdays: "dias úteis", everyday: "todos os dias" } },
      deliver: { label: "Onde entregar?" },
    },
  },
  "gratitude-journal": {
    title: "Gratidão e reflexão",
    description: "Prompt gentil no fim do dia para notar o que deu certo.",
    fields: {
      time: { label: "Que horas?" },
      recurrence: { label: "Repetir em", options: { everyday: "todos os dias", weekdays: "dias úteis" } },
      deliver: { label: "Onde entregar?" },
    },
  },
  "on-this-day": {
    title: "Curiosidade do dia",
    description: "Um fato histórico, palavra ou descoberta interessante por dia.",
    fields: {
      flavor: {
        label: "Que tipo?",
        options: {
          "on this day in history": "neste dia na história",
          "word of the day": "palavra do dia",
          "science fact": "fato de ciência",
          "quote of the day": "citação do dia",
        },
      },
      time: { label: "Que horas?" },
      deliver: { label: "Onde entregar?" },
    },
  },
};

function localizeField(field: AutomationBlueprintField, overlay?: FieldOverlay): AutomationBlueprintField {
  if (!overlay) return field;
  const options = field.options.map((opt) => overlay.options?.[opt] ?? opt);
  return {
    ...field,
    label: overlay.label ?? field.label,
    help: overlay.help ?? field.help,
    default: overlay.default ?? field.default,
    options,
  };
}

function pickLocale(locale: string): Record<string, BlueprintOverlay> | null {
  const base = locale.toLowerCase().split("-")[0];
  if (base === "pt") return PT_OVERLAY;
  return null;
}

export function localizeBlueprint(
  blueprint: AutomationBlueprint,
  locale: string,
): AutomationBlueprint {
  const overlay = pickLocale(locale)?.[blueprint.key];
  if (!overlay) return blueprint;
  return {
    ...blueprint,
    title: overlay.title ?? blueprint.title,
    description: overlay.description ?? blueprint.description,
    fields: blueprint.fields.map((f) => localizeField(f, overlay.fields?.[f.name])),
  };
}

export function sortBlueprintsForDisplay(
  blueprints: AutomationBlueprint[],
): { featured: AutomationBlueprint[]; more: AutomationBlueprint[] } {
  const byKey = new Map(blueprints.map((b) => [b.key, b]));
  const featured = FEATURED_BLUEPRINT_KEYS.map((k) => byKey.get(k)).filter(Boolean) as AutomationBlueprint[];
  const more = MORE_BLUEPRINT_KEYS.map((k) => byKey.get(k)).filter(Boolean) as AutomationBlueprint[];
  const known = new Set([...FEATURED_BLUEPRINT_KEYS, ...MORE_BLUEPRINT_KEYS]);
  for (const b of blueprints) {
    if (!known.has(b.key as (typeof FEATURED_BLUEPRINT_KEYS)[number])) more.push(b);
  }
  return { featured, more };
}
