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
  });

  it("failed instances retry dedicated Fly, not the shared app", () => {
    const source = readFileSync(join(webRoot, "app/login/verify/route.ts"), "utf8");
    expect(source).toMatch(/async function retryDedicatedProvision/);
    expect(source).not.toMatch(/promoteToSharedMotor/);
    expect(source).not.toMatch(/motor partilhado \(migrado\)/);
  });
});
