/**
 * F1 — 1 email = 1 Fly wayne-<slug>. Nunca wayne-w4y / status=desktop no signup.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(__dirname, "..");

describe("signup provisions a dedicated Fly app", () => {
  it("autoProvision always requestProvision and never pins wayne-w4y", () => {
    const source = readFileSync(join(webRoot, "app/login/verify/route.ts"), "utf8");
    const start = source.indexOf("async function autoProvision");
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, source.indexOf("async function retryDedicatedProvision", start));
    expect(body).toMatch(/requestProvision\(/);
    expect(body).toMatch(/wayne-\$\{slug\}|wayne-" \+ slug/);
    expect(body).not.toMatch(/desktopLaunchMode/);
    expect(body).not.toMatch(/sharedMotorEnabled/);
    expect(body).not.toMatch(/wayne-w4y/);
    expect(body).not.toMatch(/status', 'desktop'/);
    expect(body).not.toMatch(/motor partilhado/);
    expect(body).not.toMatch(/motor local/);
  });

  it("shared-motor flags stay off so customers never share wayne-w4y", () => {
    const source = readFileSync(join(webRoot, "lib/shared-motor.ts"), "utf8");
    expect(source).toMatch(/export function desktopLaunchMode\(\): boolean \{\s*return false;/);
    expect(source).toMatch(/export function sharedMotorEnabled\(\): boolean \{\s*return false;/);
    expect(source).toMatch(/export function useSharedMotorForPlan\(_plan: string\): boolean \{\s*return false;/);
    expect(source).toMatch(/postLoginDestination[\s\S]*\/login\/enter/);
    expect(source).toMatch(/export function isForbiddenCustomerFlyApp/);
    expect(source).toMatch(/SHARED_LAB_FLY_APP = "wayne-w4y"/);
  });

  it("failed instances retry dedicated Fly, not the shared app", () => {
    const source = readFileSync(join(webRoot, "app/login/verify/route.ts"), "utf8");
    expect(source).toMatch(/async function retryDedicatedProvision/);
    expect(source).not.toMatch(/promoteToSharedMotor/);
    expect(source).not.toMatch(/motor partilhado \(migrado\)/);
  });

  it("login/enter never falls back to wayne-w4y and migrates shared rows", () => {
    const source = readFileSync(join(webRoot, "app/login/enter/route.ts"), "utf8");
    expect(source).toMatch(/ensureDedicatedFlyInstance/);
    expect(source).toMatch(/isForbiddenCustomerFlyApp/);
    expect(source).not.toMatch(/sharedMotorEnabled\(\)/);
    expect(source).not.toMatch(/DEV_TENANT_ID/);
    expect(source).not.toMatch(/flyApp: "wayne-w4y"/);
  });

  it("ensureDedicatedFlyInstance migrates off the lab shared app", () => {
    const source = readFileSync(join(webRoot, "lib/ensure-dedicated-fly.ts"), "utf8");
    expect(source).toMatch(/isForbiddenCustomerFlyApp/);
    expect(source).toMatch(/requestProvision/);
    expect(source).toMatch(/migrado do motor partilhado/);
    expect(source).toMatch(/slugFromTenant|tenantId\.slice\(2\)|replace\(\/\^t-\//);
    // Must not mint a fresh random slug when tenant_id already encodes it.
    expect(source).not.toMatch(/const slug = slugFor\(opts\.email\)/);
  });

  it("router refuses defaulting customers onto wayne-w4y", () => {
    const source = readFileSync(
      join(webRoot, "..", "..", "router-fly", "server.js"),
      "utf8",
    );
    expect(source).toMatch(/FORBIDDEN_CUSTOMER_APPS/);
    expect(source).toMatch(/wayne-w4y/);
    expect(source).not.toMatch(/DEFAULT_APP/);
    expect(source).toMatch(/PLATFORM_LOGIN|work4you\.ai\/login/);
    expect(source).toMatch(/sendApiUnauthorized|no_route/);
    expect(source).toMatch(/isApiPath/);
  });

  it("instancias shows dedicated migration wait copy", () => {
    const source = readFileSync(join(webRoot, "app/(app)/instancias/page.tsx"), "utf8");
    expect(source).toMatch(/migrar/);
    expect(source).toMatch(/máquina dedicada/);
  });
});
