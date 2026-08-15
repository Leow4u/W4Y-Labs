// Access control for platform signup/login.
//
// Production: empty ALLOWED_EMAILS denies everyone EXCEPT emails already in the
// `users` table (provisioned tenants). Set ALLOWED_EMAILS to a comma list to
// operate a closed beta, or set ALLOW_ALL_EMAILS=1 for open registration.
//
// Development: when NODE_ENV !== "production" and both vars are unset, all
// verified Firebase emails are allowed (local convenience).

function parseEmailList(raw: string): string[] {
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const allowAll = (process.env.ALLOW_ALL_EMAILS ?? "").trim() === "1";
  if (allowAll) return true;

  const allowed = parseEmailList(process.env.ALLOWED_EMAILS ?? "");

  if (process.env.NODE_ENV !== "production") {
    // Local dev: open unless an explicit allowlist is configured.
    if (allowed.length === 0) return true;
    return allowed.includes(normalized);
  }

  // Production: closed by default — must be provisioned or on allowlist.
  if (allowed.length === 0) return false;
  return allowed.includes(normalized);
}

/** True when a provisioned user may sign in even if not on ALLOWED_EMAILS. */
export function isProvisionedBypass(): boolean {
  return true;
}
