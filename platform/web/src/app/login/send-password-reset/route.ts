import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { sendAuthEmailViaResend } from "@/lib/auth-email";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Branded password-reset email (Resend). Does not reveal whether the account exists.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`auth-mail-reset:${ip}`, 8, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  let email = "";
  try {
    email = String((await req.json()).email || "").trim().toLowerCase();
  } catch {
    /* ignore */
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  // Always return ok to avoid account enumeration. Only send when the user exists.
  try {
    await adminAuth().getUserByEmail(email);
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const actionLink = await adminAuth().generatePasswordResetLink(email, {
      url: "https://work4you.ai/login",
      handleCodeInApp: false,
    });
    const sent = await sendAuthEmailViaResend({
      to: email,
      kind: "reset",
      actionLink,
    });
    if (!sent.ok) {
      return NextResponse.json(
        { ok: false, error: "send_failed", detail: sent.error },
        { status: 502 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "link_failed";
    return NextResponse.json({ ok: false, error: "link_failed", detail: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}