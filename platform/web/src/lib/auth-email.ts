/** Branded transactional auth emails (platform-wide - Resend API). */

export type AuthEmailKind = "verify" | "reset";

const FROM = "Work4You <no-reply@work4you.ai>";
const REPLY_TO = "contato@work4you.ai";
const PRODUCT_ACTION = "https://work4you.ai/login/action";

/**
 * Firebase Admin links point at *.firebaseapp.com - corporate filters (M365)
 * often quarantine or strip those. Rewrite to our domain; the oobCode still
 * works via applyActionCode / confirmPasswordReset on /login/action.
 */
export function toProductActionLink(firebaseActionLink: string): string {
  try {
    const u = new URL(firebaseActionLink);
    const mode = u.searchParams.get("mode") || "";
    const oobCode = u.searchParams.get("oobCode") || "";
    if (!mode || !oobCode) return firebaseActionLink;
    const out = new URL(PRODUCT_ACTION);
    out.searchParams.set("mode", mode);
    out.searchParams.set("oobCode", oobCode);
    return out.toString();
  } catch {
    return firebaseActionLink;
  }
}

function shell(
  title: string,
  introHtml: string,
  ctaLabel: string,
  link: string,
  footerNote: string,
): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f1ea;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fafaf7;border:1px solid #e2e4da;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#3f5233;padding:28px 32px;">
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#eef1e5;">Work4You</div>
          <div style="margin-top:8px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:22px;font-weight:600;color:#fafaf7;line-height:1.3;">${title}</div>
        </td></tr>
        <tr><td style="padding:32px;">
          ${introHtml}
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 28px;"><tr>
            <td style="border-radius:12px;background:#1a1c18;">
              <a href="${link}" style="display:inline-block;padding:14px 28px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;font-weight:600;color:#fafaf7;text-decoration:none;">${ctaLabel}</a>
            </td>
          </tr></table>
          <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;line-height:1.5;color:#8b9081;">${footerNote}</p>
        </td></tr>
        <tr><td style="padding:18px 32px 28px;border-top:1px solid #e2e4da;">
          <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:#8b9081;">Work4You - <a href="https://work4you.ai" style="color:#3f5233;text-decoration:none;">work4you.ai</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function otpBlock(code: string | undefined): string {
  if (!code) return "";
  const safe = escapeHtml(code);
  return `<p style="margin:0 0 8px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;line-height:1.5;color:#565b4e;">Ou introduza este c&oacute;digo em <a href="https://work4you.ai/login" style="color:#3f5233;">work4you.ai/login</a>:</p>
          <p style="margin:0 0 24px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;letter-spacing:0.35em;font-weight:600;color:#1a1c18;">${safe}</p>`;
}

export function buildAuthEmail(
  kind: AuthEmailKind,
  email: string,
  actionLink: string,
  opts?: { otpCode?: string },
): {
  subject: string;
  html: string;
  text: string;
} {
  const safeEmail = escapeHtml(email);
  const productLink = toProductActionLink(actionLink);
  const safeLink = escapeHtml(productLink);
  const otp = opts?.otpCode?.replace(/\D/g, "").slice(0, 8);

  if (kind === "verify") {
    return {
      subject: "Confirme o seu email - Work4You",
      html: shell(
        "Confirme o seu email",
        `<p style="margin:0 0 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1a1c18;">Ol&aacute;,</p>
          <p style="margin:0 0 24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#565b4e;">Para activar a sua conta Work4You associada a <strong style="color:#1a1c18;">${safeEmail}</strong>, confirme o endere&ccedil;o com o bot&atilde;o abaixo.</p>
          ${otpBlock(otp)}`,
        "Confirmar email",
        safeLink,
        "Se n&atilde;o criou uma conta Work4You, ignore este email. O link e o c&oacute;digo expiram por seguran&ccedil;a. Se n&atilde;o encontrar a mensagem, verifique o spam ou a quarentena do Outlook.",
      ),
      text: [
        `Confirme o seu email Work4You (${email}).`,
        otp ? `Codigo: ${otp}` : "",
        `Abra este link: ${productLink}`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  return {
    subject: "Redefinir palavra-passe - Work4You",
    html: shell(
      "Redefinir palavra-passe",
      `<p style="margin:0 0 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1a1c18;">Ol&aacute;,</p>
          <p style="margin:0 0 24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#565b4e;">Recebemos um pedido para redefinir a palavra-passe da conta <strong style="color:#1a1c18;">${safeEmail}</strong>.</p>`,
      "Escolher nova palavra-passe",
      safeLink,
      "Se n&atilde;o pediu esta altera&ccedil;&atilde;o, ignore este email. O link expira por seguran&ccedil;a.",
    ),
    text: `Redefina a palavra-passe Work4You (${email}). Abra este link: ${productLink}`,
  };
}

export async function sendAuthEmailViaResend(opts: {
  to: string;
  kind: AuthEmailKind;
  actionLink: string;
  otpCode?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    return { ok: false, error: "resend_not_configured" };
  }
  const built = buildAuthEmail(opts.kind, opts.to, opts.actionLink, {
    otpCode: opts.otpCode,
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [opts.to],
      reply_to: REPLY_TO,
      subject: built.subject,
      html: built.html,
      text: built.text,
      headers: {
        "X-Entity-Ref-ID": `w4y-auth-${opts.kind}-${Date.now()}`,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      error: `resend_${res.status}:${detail.slice(0, 200)}`,
    };
  }
  return { ok: true };
}