import "server-only";
import { createHash, randomInt } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function pepper(): string {
  return (
    process.env.AUTH_OTP_PEPPER?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    "w4y-dev-otp-pepper"
  );
}

function hashCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${pepper()}|${email.trim().toLowerCase()}|${code}`)
    .digest("hex");
}

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await db().execute(sql`
    CREATE TABLE IF NOT EXISTS auth_email_codes (
      email text PRIMARY KEY,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  ensured = true;
}

/** Issues a fresh 6-digit code for email verification (overwrites prior). */
export async function issueEmailVerifyOtp(email: string): Promise<string> {
  await ensureTable();
  const normalized = email.trim().toLowerCase();
  const code = String(randomInt(100_000, 1_000_000)); // no leading zero — numeric inputs drop them
  const codeHash = hashCode(normalized, code);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  await db().execute(sql`
    INSERT INTO auth_email_codes (email, code_hash, expires_at, attempts, updated_at)
    VALUES (${normalized}, ${codeHash}, ${expiresAt}::timestamptz, 0, now())
    ON CONFLICT (email) DO UPDATE SET
      code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at,
      attempts = 0,
      updated_at = now()
  `);
  return code;
}

export async function consumeEmailVerifyOtp(
  email: string,
  code: string,
): Promise<"ok" | "invalid" | "expired" | "locked"> {
  await ensureTable();
  const normalized = email.trim().toLowerCase();
  const digits = code.replace(/\D/g, "").slice(0, 8);
  if (digits.length < 6) return "invalid";

  const rows = await db().execute<{
    code_hash: string;
    expires_at: Date | string;
    attempts: number;
  }>(sql`
    SELECT code_hash, expires_at, attempts
    FROM auth_email_codes
    WHERE email = ${normalized}
    LIMIT 1
  `);
  const row = rows.rows?.[0];
  if (!row) return "invalid";

  const attempts = Number(row.attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) return "locked";

  const exp =
    row.expires_at instanceof Date
      ? row.expires_at.getTime()
      : Date.parse(String(row.expires_at));
  if (!Number.isFinite(exp) || exp < Date.now()) return "expired";

  const ok = hashCode(normalized, digits) === row.code_hash;
  if (!ok) {
    await db().execute(sql`
      UPDATE auth_email_codes
      SET attempts = attempts + 1, updated_at = now()
      WHERE email = ${normalized}
    `);
    return "invalid";
  }

  await db().execute(sql`
    DELETE FROM auth_email_codes WHERE email = ${normalized}
  `);
  return "ok";
}