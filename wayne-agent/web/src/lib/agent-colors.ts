/**
 * Cor estável por agente (profile) — usada no chip da rotina e nos eventos do
 * calendário, pra o olho ligar "esse evento é do agente X". Determinístico:
 * hash do nome → índice numa paleta Editorial (funciona em claro e escuro).
 */
const AGENT_PALETTE = [
  "#C7912B", // âmbar
  "#2B579A", // azul
  "#217346", // verde
  "#7C3AED", // violeta
  "#D24726", // laranja
  "#0E7490", // teal
  "#BE185D", // rosa
  "#4D7C0F", // oliva
];

export function agentColorOf(profile: string): string {
  const key = (profile || "default").toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AGENT_PALETTE[h % AGENT_PALETTE.length];
}
