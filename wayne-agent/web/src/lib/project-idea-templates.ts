/**
 * Starter ideas for the new-project modal — the chips fill the "Ideia" field
 * (saved to IDEA.md on creation). Ported from
 * apps/desktop/src/lib/project-idea-templates.ts (same list, 18 items, same
 * emojis), translated to PT-BR. This is seed content (fixture), not UI
 * chrome — hence PT only, unlike the modal's labels, which follow the 16
 * languages as always.
 */
export interface ProjectIdeaTemplate {
  emoji: string;
  label: string;
  idea: string;
}

export const PROJECT_IDEA_TEMPLATES: ProjectIdeaTemplate[] = [
  { emoji: "🎮", label: "Game jam", idea: "Um joguinho de navegador feito num fim de semana.\n\n- Uma mecânica central, feedback caprichado\n- Sem build — um único arquivo HTML/JS\n- Jogável em menos de 60 segundos" },
  { emoji: "📚", label: "Romance", idea: "Um romance em progresso.\n\n- Acompanhar capítulos, personagens e linha do tempo\n- Meta diária de palavras\n- Notas de pesquisa ao lado do rascunho" },
  { emoji: "🤖", label: "Bot do Discord", idea: "Um bot de Discord pra uma comunidade pequena.\n\n- Slash commands + um ritual diário divertido\n- Persistência leve\n- Deploy em algo gratuito" },
  { emoji: "📊", label: "Visualização de dados", idea: "Uma visualização interativa de um dataset que me importa.\n\n- Escolher o dataset e a única pergunta que ele responde\n- Limpar → gráfico → anotar\n- Compartilhável numa única página" },
  { emoji: "🎨", label: "Arte generativa", idea: "Uma peça de arte generativa.\n\n- Um algoritmo, muitas sementes\n- Exportar imagens em alta resolução\n- Uma galeria com os melhores resultados" },
  { emoji: "🍳", label: "Caderno de receitas", idea: "Uma coleção pessoal de receitas.\n\n- Buscável por ingrediente e humor\n- Ajustar porções na hora\n- Montar lista de compras automática" },
  { emoji: "🧪", label: "Diário de pesquisa", idea: "Um caderno de pesquisa pra uma pergunta em aberto.\n\n- Registrar experimentos, resultados e becos sem saída\n- Citar fontes inline\n- Síntese semanal do que aprendi" },
  { emoji: "💸", label: "Controle de gastos", idea: "Um controle de gastos sem frescura.\n\n- Importar transações, marcar rápido\n- Gasto do mês vs. planejado\n- Um gráfico que não mente" },
  { emoji: "🌱", label: "Rastreador de hábitos", idea: "Um rastreador de hábitos que funciona de verdade.\n\n- Um punhado de checkboxes diários\n- Sequências sem culpa\n- Uma revisão semanal tranquila" },
  { emoji: "🗺️", label: "Roteiro de viagem", idea: "Um roteiro pra uma próxima viagem.\n\n- Itinerário dia a dia\n- Mapa com pontos + anotações\n- Checklist de bagagem + orçamento" },
  { emoji: "🎵", label: "Brinquedo musical", idea: "Um brinquedinho de fazer música.\n\n- Um instrumento ou sequenciador\n- Web Audio, sem instalar nada\n- Gravar + compartilhar um loop" },
  { emoji: "🧩", label: "Gerador de quebra-cabeças", idea: "Um gerador pra um quebra-cabeça que eu curto.\n\n- Gerar puzzles solucionáveis por procedimento\n- Controle de dificuldade\n- Imprimível + jogável" },
  { emoji: "📝", label: "Jardim digital", idea: "Um jardim digital / wiki pessoal.\n\n- Notas atômicas que se linkam entre si\n- Cresce com o tempo, nunca fica \"pronto\"\n- Publicar as públicas" },
  { emoji: "🛰️", label: "Wrapper de API", idea: "Um wrapper limpo pra uma API que eu sempre uso.\n\n- Cliente tipado + padrões sensatos\n- Um exemplo por endpoint\n- Publicar" },
  { emoji: "🏋️", label: "Plano de treino", idea: "Um planejador/registro de treinos.\n\n- Montar uma divisão semanal\n- Registrar séries rápido no celular\n- Acompanhar progresso ao longo dos meses" },
  { emoji: "🧠", label: "Flashcards", idea: "Um app de flashcards com repetição espaçada.\n\n- Captura rápida de cartões\n- Agendamento SM-2 simples\n- Revisão diária que cabe em 5 minutos" },
  { emoji: "✍️", label: "Roteiro", idea: "Um roteiro curto.\n\n- Logline → pontos → cenas\n- Formato correto, sem distração\n- Uma leitura em mesa até o final" },
  { emoji: "🔭", label: "Aprender fazendo", idea: "Um projeto pra aprender algo que venho evitando.\n\n- A menor coisa real que ensina aquilo\n- Notas de cada pegadinha\n- Um relato quando funcionar" },
];

/** A shuffled sample of the pool — the chips currently shown. */
export function randomIdeaTemplates(count = 6): ProjectIdeaTemplate[] {
  const pool = [...PROJECT_IDEA_TEMPLATES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
