/**
 * Turns a channel's raw environment variables into fields a person can fill.
 *
 * The config modal used to render the backend's metadata verbatim: the label
 * was "Enable WhatsApp? (true/false)", the hint said "requires the Node.js
 * bridge running", and the placeholder was the variable name itself —
 * WHATSAPP_ENABLED. That is a developer form wearing a product's clothes.
 *
 * The rules below are SUFFIX-based on purpose. Every channel in the catalog
 * names its variables the same way (<CHANNEL>_BOT_TOKEN, <CHANNEL>_ALLOWED_
 * USERS, <CHANNEL>_HOME_CHANNEL…), so a handful of suffixes covers the 31
 * channels we ship today AND the ones added later, instead of a table that
 * silently falls back to English the moment someone adds a platform.
 */
import type { MessagingPlatformEnvVar } from "@/lib/api";

export type FieldKind = "text" | "password" | "boolean" | "number";

export interface ChannelFieldMeta {
  label: string;
  hint?: string;
  kind: FieldKind;
  /** Hidden behind "advanced": nobody needs it to connect. */
  advanced: boolean;
}

interface Rule {
  /** Matched against the END of the variable name. */
  suffix: string;
  kind?: FieldKind;
  advanced?: boolean;
  /** Key inside t.channels.fields. */
  labelKey: string;
  hintKey?: string;
}

/** Order matters: the first match wins, so longer suffixes come first. */
const RULES: Rule[] = [
  { suffix: "_ALLOW_ALL_USERS", kind: "boolean", advanced: true, labelKey: "allowAll" },
  { suffix: "_ALLOWED_USERS", labelKey: "allowedUsers", hintKey: "allowedUsersHint" },
  { suffix: "_HOME_CHANNEL_NAME", advanced: true, labelKey: "homeName" },
  { suffix: "_HOME_CHANNEL", advanced: true, labelKey: "homeChannel", hintKey: "homeChannelHint" },
  { suffix: "_HOME_ADDRESS", advanced: true, labelKey: "homeAddress", hintKey: "homeChannelHint" },
  { suffix: "_BOT_TOKEN", kind: "password", labelKey: "botToken", hintKey: "botTokenHint" },
  { suffix: "_ACCESS_TOKEN", kind: "password", labelKey: "accessToken" },
  { suffix: "_APP_TOKEN", kind: "password", labelKey: "appToken" },
  { suffix: "_API_KEY", kind: "password", labelKey: "apiKey" },
  { suffix: "_SIGNING_SECRET", kind: "password", advanced: true, labelKey: "signingSecret" },
  { suffix: "_PHONE_NUMBER_ID", labelKey: "phoneNumberId" },
  { suffix: "_IMAP_HOST", labelKey: "imapHost", hintKey: "imapHostHint" },
  { suffix: "_SMTP_HOST", labelKey: "smtpHost", hintKey: "smtpHostHint" },
  { suffix: "_SMTP_PORT", kind: "number", advanced: true, labelKey: "smtpPort" },
  { suffix: "_IMAP_PORT", kind: "number", advanced: true, labelKey: "imapPort" },
  { suffix: "_PASSWORD", kind: "password", labelKey: "password", hintKey: "passwordHint" },
  { suffix: "_ADDRESS", labelKey: "address" },
  { suffix: "_WEBHOOK_URL", labelKey: "webhookUrl" },
  { suffix: "_PROXY", advanced: true, labelKey: "proxy" },
  { suffix: "_ENABLED", kind: "boolean", advanced: true, labelKey: "enabled" },
  { suffix: "_MODE", advanced: true, labelKey: "mode" },
];

/** The `channels.fields` block of the translations. */
type FieldStrings = Record<string, string>;

/**
 * A field the modal can render. Unknown variables stay visible (never hide
 * something the user might need) but lose the raw name: they get a readable
 * form of the key and no English hint.
 */
export function channelFieldMeta(
  field: MessagingPlatformEnvVar,
  strings: FieldStrings,
): ChannelFieldMeta {
  const key = (field.key || "").toUpperCase();
  for (const rule of RULES) {
    if (!key.endsWith(rule.suffix)) continue;
    return {
      // The translations live flat on t.channels with an fld_ prefix, so
      // rule keys map straight onto them.
      label: strings[`fld_${rule.labelKey}`] || humanizeKey(key),
      hint: rule.hintKey ? strings[`fld_${rule.hintKey}`] : undefined,
      kind: rule.kind ?? (field.is_password ? "password" : "text"),
      // A required field is never buried, whatever the rule says.
      advanced: field.required ? false : Boolean(rule.advanced),
    };
  }
  return {
    label: humanizeKey(key),
    kind: field.is_password ? "password" : "text",
    advanced: false,
  };
}

/**
 * WHATSAPP_HOME_CHANNEL → "Home channel". Last resort for a variable no rule
 * knows: still infinitely better than printing WHATSAPP_HOME_CHANNEL at
 * someone who just wants to connect their WhatsApp.
 */
export function humanizeKey(key: string): string {
  const parts = key.split("_").filter(Boolean);
  // Drop the channel prefix (WHATSAPP_, TELEGRAM_…) when there is more to say.
  const rest = parts.length > 1 ? parts.slice(1) : parts;
  const text = rest.join(" ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The backend's channel state, in the owner's language.
 *
 * `state` arrives as a raw identifier — "not_configured", "pending_restart",
 * "gateway_stopped". The channels list already translated it; the agent drawer
 * printed it verbatim, so a row said "WhatsApp / not_configured" — English, in
 * code, inside a product in Portuguese.
 *
 * Living here instead of inside either screen so the two cannot drift: the
 * whole point of today's work is that one truth beats two copies.
 *
 * An unknown state falls back to the raw string. That is deliberate: a new
 * backend state should look odd and get reported, not disappear behind a
 * plausible-but-wrong label.
 */
export interface ChannelStateCopy {
  stateConnected: string;
  statePendingRestart: string;
  stateGatewayStopped: string;
  stateStartFailed: string;
  stateDisconnected: string;
  stateNotConfigured: string;
  stateDisabled: string;
  stateError: string;
}

export function channelStateLabel(state: string, c: ChannelStateCopy): string {
  const labels: Record<string, string> = {
    connected: c.stateConnected,
    pending_restart: c.statePendingRestart,
    gateway_stopped: c.stateGatewayStopped,
    startup_failed: c.stateStartFailed,
    disconnected: c.stateDisconnected,
    not_configured: c.stateNotConfigured,
    disabled: c.stateDisabled,
    fatal: c.stateError,
  };
  return labels[state] ?? state;
}

/** True for the values a boolean field accepts as "on". */
export function isTruthyEnv(value: string | null | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}
