import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { adminAuth, FIREBASE_PROJECT_ID } from "@/lib/firebase-admin";
import { sendAuthEmailViaResend } from "@/lib/auth-email";
import { issueEmailVerifyOtp } from "@/lib/auth-email-otp";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

/**
 * Sends a branded Work4You verification email via Resend.
 * Client creates the Firebase user, then POSTs the idToken here instead of
 * calling Firebase sendEmailVerification (ugly default template).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`auth-mail-verify:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  let idToken = "";
  try {
    idToken = String((await req.json()).idToken || "");
  } catch {
    /* ignore */
  }
  if (!idToken) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  let email = "";
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    email = String(payload.email || "").trim().toLowerCase();
    if (payload.email_verified === true) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });
  }

  let actionLink: string;
  try {
    actionLink = await adminAuth().generateEmailVerificationLink(email, {
      url: "https://work4you.ai/login",
      handleCodeInApp: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "link_failed";
    return NextResponse.json({ ok: false, error: "link_failed", detail: msg }, { status: 502 });
  }

  let otpCode: string | undefined;
  try {
    otpCode = await issueEmailVerifyOtp(email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "otp_failed";
    return NextResponse.json({ ok: false, error: "otp_failed", detail: msg }, { status: 502 });
  }

  const sent = await sendAuthEmailViaResend({
    to: email,
    kind: "verify",
    actionLink,
    otpCode,
  });
  if (!sent.ok) {
    return NextResponse.json(
      { ok: false, error: "send_failed", detail: sent.error },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}