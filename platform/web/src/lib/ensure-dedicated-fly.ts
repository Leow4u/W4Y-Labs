import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requestProvision, slugFor } from "@/lib/provisioner";
import { FREE_ALLOWANCE_USD } from "@/lib/billing";
import { isForbiddenCustomerFlyApp } from "@/lib/shared-motor";

/**
 * Ensure the registry row points at a dedicated `wayne-<slug>` and kick
 * provisioner. Used when a legacy/shared `wayne-w4y` (or empty) fly_app is
 * found at login — customers must not stay on the lab shared motor.
 */
export async function ensureDedicatedFlyInstance(opts: {
  tenantId: string;
  email: string;
}): Promise<"ready" | "provisioning" | "failed"> {
  const database = db();
  const slug = slugFor(opts.email);
  const flyApp = `wayne-${slug}`;
  const tenantId = opts.tenantId.startsWith("t-")
    ? opts.tenantId
    : `t-${slug}`;

  const existing = await database.execute<{
    status: string;
    fly_app: string | null;
  }>(
    sql`SELECT status, fly_app FROM instances WHERE tenant_id=${tenantId} LIMIT 1`,
  );
  const row = existing.rows[0];

  if (
    row &&
    row.status === "ready" &&
    row.fly_app &&
    !isForbiddenCustomerFlyApp(row.fly_app)
  ) {
    return "ready";
  }

  if (row && row.status === "provisioning" && !isForbiddenCustomerFlyApp(row.fly_app)) {
    return "provisioning";
  }

  if (!row) {
    await database.execute(sql`
      INSERT INTO instances (tenant_id, name, url, fly_app, status, notes)
      VALUES (
        ${tenantId},
        ${"Work4You — " + slug},
        '',
        ${flyApp},
        'provisioning',
        'Free · Fly dedicada (migrado do motor partilhado)'
      )
    `);
  } else {
    await database.execute(sql`
      UPDATE instances SET
        url='',
        fly_app=${flyApp},
        status='provisioning',
        notes='Free · Fly dedicada (migrado do motor partilhado)'
      WHERE tenant_id=${tenantId}
    `);
  }

  const started = await requestProvision({
    tenantId,
    slug,
    email: opts.email,
    plan: "base",
    trialUsd: FREE_ALLOWANCE_USD,
  });
  if (!started) {
    await database.execute(
      sql`UPDATE instances SET status='failed', notes='Migração: provisionador indisponível' WHERE tenant_id=${tenantId}`,
    );
    return "failed";
  }
  return "provisioning";
}
