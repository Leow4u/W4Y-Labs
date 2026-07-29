import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { createBillingPortalSession } from "@/lib/billing";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

/**
 * GET /planos/portal — Stripe Customer Portal session for the signed-in tenant.
 * Desktop Conta "Manage subscription" and web `openBillingPortal()` land here.
 * No Stripe customer yet → /planos (upgrade/subscribe). Unauthed → login.
 */
export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const session = await getDevSession();
  if (!session) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/planos/portal")}`, origin), 303);
  }

  try {
    const r = await db().execute<{ stripe_customer_id: string | null }>(
      sql`SELECT stripe_customer_id FROM billing WHERE tenant_id=${session.tenantId}`,
    );
    const customerId = (r.rows[0]?.stripe_customer_id || "").trim();
    if (!customerId) {
      return NextResponse.redirect(new URL("/planos", origin), 303);
    }

    const url = await createBillingPortalSession({
      customerId,
      returnUrl: `${origin}/planos`,
    });
    if (!url) {
      return NextResponse.redirect(new URL("/planos?erro=portal", origin), 303);
    }
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.redirect(new URL("/planos?erro=portal", origin), 303);
  }
}

function originOf(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "work4you.ai";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
