/**
 * Stable per-agent (profile) color — used on the routine chip and on the
 * calendar events, so the eye connects "this event belongs to agent X".
 * Deterministic: name hash → index into an Editorial palette (works in light
 * and dark).
 */
const AGENT_PALETTE = [
  "#C7912B", // amber
  "#2B579A", // blue
  "#217346", // green
  "#7C3AED", // violet
  "#D24726", // orange
  "#0E7490", // teal
  "#BE185D", // pink
  "#4D7C0F", // olive
];

export function agentColorOf(profile: string): string {
  const key = (profile || "default").toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AGENT_PALETTE[h % AGENT_PALETTE.length];
}
