import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { consumeEmailVerifyOtp } from "@/lib/auth-email-otp";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Confirms email with the 6-digit code from the branded Work4You message.
 * Used when corporate filters deliver mail but strip/quarantine the CTA link.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`auth-mail-code:${ip}`, 12, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  let email = "";
  let code = "";
  try {
    const body = await req.json();
    email = String(body.email || "").trim().toLowerCase();
    code = String(body.code || "").trim();
  } catch {
    /* ignore */
  }
  if (!email.includes("@") || code.replace(/\D/g, "").length < 6) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const verdict = await consumeEmailVerifyOtp(email, code);
  if (verdict !== "ok") {
    const status = verdict === "locked" ? 429 : 400;
    return NextResponse.json({ ok: false, error: verdict }, { status });
  }

  try {
    const user = await adminAuth().getUserByEmail(email);
    if (!user.emailVerified) {
      await adminAuth().updateUser(user.uid, { emailVerified: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "user_failed";
    return NextResponse.json({ ok: false, error: "user_failed", detail: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}