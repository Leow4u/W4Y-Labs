// Porta do MVP: allowlist de e-mails. ALLOWED_EMAILS = lista separada por
// vírgula. Vazio = libera todos (só para dev local). O Identity Platform
// substitui isso na próxima fase.
export function isEmailAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(email.trim().toLowerCase());
}
