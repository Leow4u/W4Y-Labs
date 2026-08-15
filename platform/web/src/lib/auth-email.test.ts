import { describe, expect, it } from "vitest";
import { buildAuthEmail, toProductActionLink } from "./auth-email";

describe("toProductActionLink", () => {
  it("rewrites firebaseapp action URLs onto work4you.ai", () => {
    const link =
      "https://project-67a4bd4d-a990-406b-9e7.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=abc123&apiKey=x&continueUrl=https%3A%2F%2Fwork4you.ai%2Flogin&lang=en";
    expect(toProductActionLink(link)).toBe(
      "https://work4you.ai/login/action?mode=verifyEmail&oobCode=abc123",
    );
  });
});

describe("buildAuthEmail", () => {
  it("verify email uses product CTA, OTP, and never prints raw firebase URL", () => {
    const firebaseLink =
      "https://project-x.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=abc123";
    const mail = buildAuthEmail("verify", "user@example.com", firebaseLink, {
      otpCode: "123456",
    });
    expect(mail.subject).toContain("Work4You");
    expect(mail.html).toContain("Confirmar email");
    expect(mail.html).toContain("123456");
    expect(mail.html).toContain("work4you.ai/login/action");
    expect(mail.html).not.toContain("firebaseapp.com");
    expect(mail.html).not.toMatch(/>https:\/\/work4you\.ai\/login\/action/);
    expect(mail.html).toContain("user@example.com");
    expect(mail.text).toContain("Codigo: 123456");
  });

  it("reset email is branded similarly", () => {
    const link =
      "https://project-x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=xyz";
    const mail = buildAuthEmail("reset", "user@example.com", link);
    expect(mail.subject).toMatch(/palavra-passe/i);
    expect(mail.html).toContain("Escolher nova palavra-passe");
    expect(mail.html).toContain("Work4You");
    expect(mail.html).toContain("work4you.ai/login/action");
  });
});