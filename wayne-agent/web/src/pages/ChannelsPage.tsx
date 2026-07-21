import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Mail,
  MessageSquare,
  PlugZap,
  QrCode,
  RotateCw,
  Save,
  Settings2,
  WifiOff,
  X,
} from "lucide-react";
import * as QRCode from "qrcode";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Input } from "@nous-research/ui/ui/components/input";
import { Label } from "@nous-research/ui/ui/components/label";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { api } from "@/lib/api";
import type {
  MessagingPlatform,
  MessagingPlatformEnvVar,
  MessagingPlatformUpdate,
  ProfileInfo,
  TelegramOnboardingStartResponse,
} from "@/lib/api";
import { channelFieldMeta, isTruthyEnv } from "@/lib/channel-fields";
import { isInternalView } from "@/lib/internal-view";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useI18n } from "@/i18n";
import type { Translations } from "@/i18n";
import { cn, themedBody } from "@/lib/utils";

type ChannelCopy = Translations["channels"];
type BadgeTone = "success" | "warning" | "destructive" | "secondary" | "outline";

// State → badge mapping. The backend emits a small, fixed vocabulary plus
// whatever the live gateway runtime reports (connected/disconnected/fatal).
// Tone carries the semantics; "connected" additionally gets the explicit
// success token so it always reads green rather than inheriting the
// terracotta accent from the design system's default badge surface.
const STATE_TONE: Record<string, BadgeTone> = {
  connected: "success",
  pending_restart: "warning",
  gateway_stopped: "warning",
  startup_failed: "destructive",
  disconnected: "warning",
  not_configured: "outline",
  disabled: "secondary",
  fatal: "destructive",
};

const SUCCESS_BADGE_CLASS = "bg-success/12 text-success border-success/30";

function stateBadge(state: string, c: ChannelCopy) {
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
  return {
    tone: STATE_TONE[state] ?? ("outline" as BadgeTone),
    label: labels[state] ?? state,
    className: state === "connected" ? SUCCESS_BADGE_CLASS : undefined,
  };
}

// Card name + description come from OUR copy, keyed by platform id, so the
// customer never reads the backend's raw English. Platforms we haven't
// written copy for fall back to whatever the catalog reports.
function platformCopy(platform: MessagingPlatform, c: ChannelCopy) {
  const entry = (c.platformCopy as Record<string, { name: string; desc: string } | undefined>)[
    platform.id
  ];
  return {
    name: entry?.name || platform.name,
    description: entry?.desc || platform.description,
  };
}

const TELEGRAM_USER_ID_RE = /^\d+$/;
const SLACK_MEMBER_ID_RE = /^[UW][A-Z0-9]{2,}$/;
const SLACK_TOKEN_PREFIXES: Record<string, string> = {
  SLACK_BOT_TOKEN: "xoxb-",
  SLACK_APP_TOKEN: "xapp-",
};

function validateMessagingEnvField(
  field: MessagingPlatformEnvVar,
  value: string,
  c: ChannelCopy,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const expectedPrefix = SLACK_TOKEN_PREFIXES[field.key];
  if (expectedPrefix && !trimmed.startsWith(expectedPrefix)) {
    return c.errPrefix
      .replace("{field}", field.prompt || field.key)
      .replace("{prefix}", expectedPrefix);
  }

  if (field.key === "SLACK_ALLOWED_USERS") {
    // Mirror the gateway's parse (gateway/platforms/slack.py): drop empty
    // entries so a trailing/interior comma isn't rejected here. "*" is the
    // allow-all wildcard the gateway honors.
    const parts = trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const invalid = parts.find((part) => part !== "*" && !SLACK_MEMBER_ID_RE.test(part));
    if (invalid) {
      return c.errSlackId.replace("{value}", invalid);
    }
  }

  return null;
}

// Returns the remaining "m:ss", or null once the pairing window has closed —
// the caller renders the localized "expired" label for null.
function formatExpiry(expiresAt: string): string | null {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function isTerminalTelegramOnboardingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b410\b/.test(message) && /\b(expired|claimed|gone)\b/i.test(message);
}

// Channel curation: only the main ones show by default (WhatsApp first); the
// rest sits behind the "see all channels" toggle; the technical plumbing
// (internal API/webhook/relay) disappears for the user — visible only under
// ?full=1. Same system×user principle as the product's other screens.
//
// Order here IS the render order of the default view, so the two WhatsApp
// flavors sit next to each other rather than at opposite ends of the list.
const FEATURED_CHANNELS = [
  "whatsapp",
  "whatsapp_cloud",
  "telegram",
  "discord",
  "slack",
  "email",
  "sms",
  "google_chat",
  "teams",
] as const;

const SYSTEM_CHANNELS = new Set<string>([
  "api_server",
  "webhook",
  "relay",
  "raft",
  "photon",
  "msgraph_webhook",
  "wecom_callback",
]);

// Real brand logo (Composio's logo CDN) per channel — only slugs that REALLY
// exist in the catalog (a guess → blank tile). Covers every featured channel.
// The niche ones (behind "see all channels") have no logo in the catalog and
// fall back to the initial tile. Email/SMS are protocols, not brands → glyph.
const CHANNEL_LOGO: Record<string, string> = {
  whatsapp: "whatsapp",
  whatsapp_cloud: "whatsapp",
  telegram: "telegram",
  discord: "discord",
  slack: "slack",
  google_chat: "google_chat",
  teams: "microsoft_teams",
};

function ChannelLogo({ platform }: { platform: MessagingPlatform }) {
  const [failed, setFailed] = useState(false);
  const tile = "grid h-9 w-9 shrink-0 place-items-center rounded-lg";
  if (platform.id === "email") {
    return (
      <span className={cn(tile, "bg-muted text-foreground")}>
        <Mail className="h-4 w-4" />
      </span>
    );
  }
  if (platform.id === "sms") {
    return (
      <span className={cn(tile, "bg-muted text-foreground")}>
        <MessageSquare className="h-4 w-4" />
      </span>
    );
  }
  const slug = CHANNEL_LOGO[platform.id];
  if (!slug || failed) {
    return (
      <span className={cn(tile, "bg-muted text-sm font-semibold text-foreground")}>
        {(platform.name || "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={`https://logos.composio.dev/api/${slug}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1"
    />
  );
}

export default function ChannelsPage() {
  const { t } = useI18n();
  const c = t.channels;
  const [platforms, setPlatforms] = useState<MessagingPlatform[]>([]);
  const [envPath, setEnvPath] = useState("~/.wayne/.env");
  const [gatewayStartCommand, setGatewayStartCommand] = useState(
    "wayne gateway start",
  );
  const [loading, setLoading] = useState(true);
  // Channel scope: "global" = default install (the tenant's main agent) ×
  // profile name = that agent's own channels. The messaging backend is already
  // profile-scoped; here we only offer the switch. Each agent has its OWN
  // channel (its own bot/token) — sharing credentials between agents makes no
  // sense, so this is target selection, not fan-out.
  const [scope, setScope] = useState("global");
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const profileParam = scope === "global" ? undefined : scope;
  const [showMore, setShowMore] = useState(false);
  const { toast, showToast } = useToast();
  const { setEnd } = usePageHeader();

  // Config modal state
  const [editing, setEditing] = useState<MessagingPlatform | null>(null);
  const [draftEnv, setDraftEnv] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const closeEdit = useCallback(() => {
    setEditing(null);
    setFieldErrors({});
  }, []);
  const editModalRef = useModalBehavior({ open: editing !== null, onClose: closeEdit });

  // Per-card busy + restart-needed tracking
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const gatewayRunning = platforms.length > 0 && platforms[0].gateway_running;

  // Curation: featured (the main ones, WhatsApp first) × extra ("Mostrar
  // mais") × system (technical plumbing, hidden from the user). In the internal
  // view (?full=1) we show everything, uncurated — it is the admin surface.
  const internal = isInternalView();
  const { featured, extra } = useMemo(() => {
    const byId = new Map(platforms.map((p) => [p.id, p]));
    const featuredList: MessagingPlatform[] = [];
    for (const id of FEATURED_CHANNELS) {
      const p = byId.get(id);
      if (p) {
        featuredList.push(p);
        byId.delete(id);
      }
    }
    const extraList: MessagingPlatform[] = [];
    for (const p of byId.values()) {
      if (!SYSTEM_CHANNELS.has(p.id)) extraList.push(p);
    }
    return { featured: featuredList, extra: extraList };
  }, [platforms]);
  const visible = internal
    ? platforms
    : [...featured, ...(showMore ? extra : [])];

  const load = useCallback(() => {
    return api
      .getMessagingPlatforms(profileParam)
      .then((res) => {
        setPlatforms(res.platforms);
        setEnvPath(res.env_path || "~/.wayne/.env");
        setGatewayStartCommand(res.gateway_start_command || "wayne gateway start");
      })
      .catch((e) => showToast(c.loadError.replace("{error}", String(e)), "error"));
  }, [showToast, profileParam, c]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Agent list for the scope picker (default is left out — it is the "global").
  useEffect(() => {
    api
      .getProfiles()
      .then((r) => setProfiles(r.profiles))
      .catch(() => {});
  }, []);

  const openConfig = (platform: MessagingPlatform) => {
    const initial: Record<string, string> = {};
    platform.env_vars.forEach((v) => {
      initial[v.key] = "";
    });
    setDraftEnv(initial);
    setFieldErrors({});
    setEditing(platform);
  };

  const handleSave = async () => {
    if (!editing) return;
    // Only send fields the user actually filled in — leaving a field blank
    // preserves the existing value rather than clobbering it.
    const env: Record<string, string> = {};
    Object.entries(draftEnv).forEach(([k, v]) => {
      if (v.trim()) env[k] = v.trim();
    });
    if (Object.keys(env).length === 0) {
      showToast(c.nothingToSave, "error");
      return;
    }
    const missing = editing.env_vars.filter(
      (v) => v.required && !v.is_set && !env[v.key],
    );
    if (missing.length > 0) {
      showToast(
        c.fieldRequired.replace("{field}", missing[0].prompt || missing[0].key),
        "error",
      );
      return;
    }
    const nextFieldErrors: Record<string, string> = {};
    editing.env_vars.forEach((field) => {
      const message = validateMessagingEnvField(field, draftEnv[field.key] || "", c);
      if (message) nextFieldErrors[field.key] = message;
    });
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      showToast(c.fixFields, "error");
      return;
    }
    setSaving(true);
    try {
      const body: MessagingPlatformUpdate = { env, enabled: true, profile: profileParam };
      await api.updateMessagingPlatform(editing.id, body);
      showToast(
        c.saved.replace("{name}", platformCopy(editing, c).name),
        "success",
      );
      setEditing(null);
      setRestartNeeded(true);
      await load();
    } catch (e) {
      showToast(c.saveFailed.replace("{error}", String(e)), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (platform: MessagingPlatform) => {
    const next = !platform.enabled;
    setTogglingId(platform.id);
    try {
      await api.updateMessagingPlatform(platform.id, { enabled: next, profile: profileParam });
      setPlatforms((prev) =>
        prev.map((p) =>
          p.id === platform.id
            ? { ...p, enabled: next, state: next ? "pending_restart" : "disabled" }
            : p,
        ),
      );
      setRestartNeeded(true);
    } catch (e) {
      showToast(c.toggleFailed.replace("{error}", String(e)), "error");
    } finally {
      setTogglingId(null);
    }
  };

  const handleTest = async (platform: MessagingPlatform) => {
    setTestingId(platform.id);
    try {
      const res = await api.testMessagingPlatform(platform.id, profileParam);
      showToast(
        `${platformCopy(platform, c).name}: ${res.message}`,
        res.ok ? "success" : "error",
      );
    } catch (e) {
      showToast(c.testFailed.replace("{error}", String(e)), "error");
    } finally {
      setTestingId(null);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await api.restartGateway();
      showToast(c.restarting, "success");
      setRestartNeeded(false);
      // Give the gateway a moment to come up, then refresh status.
      setTimeout(() => void load(), 4000);
    } catch (e) {
      showToast(c.restartFailed.replace("{error}", String(e)), "error");
    } finally {
      setRestarting(false);
    }
  };

  useLayoutEffect(() => {
    // Curation: the "Restart gateway" button is technical plumbing — it only
    // shows in the internal view (?full=1). For the end user the restart
    // happens behind the scenes after saving.
    if (!isInternalView()) {
      setEnd(null);
      return () => setEnd(null);
    }
    setEnd(
      <Button
        className="uppercase"
        size="sm"
        onClick={handleRestart}
        disabled={restarting}
        prefix={restarting ? <Spinner /> : <RotateCw className="h-4 w-4" />}
      >
        {restarting ? "Restarting…" : "Restart gateway"}
      </Button>,
    );
    return () => setEnd(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setEnd, restarting]);

  const configured = useMemo(
    () => platforms.filter((p) => p.configured).length,
    [platforms],
  );

  // ── Campos do modal de configuração ────────────────────────────────
  // The backend describes each channel as environment variables. Rendering
  // that description verbatim is what put WHATSAPP_ENABLED on screen as a
  // placeholder and asked the user to type "true". lib/channel-fields turns
  // it into labels a person reads; here we only decide what shows up front.
  const fieldStrings = c as unknown as Record<string, string>;
  const [primaryFields, advancedFields] = useMemo(() => {
    const all = editing?.env_vars ?? [];
    const primary: MessagingPlatformEnvVar[] = [];
    const advanced: MessagingPlatformEnvVar[] = [];
    for (const f of all) {
      (channelFieldMeta(f, fieldStrings).advanced ? advanced : primary).push(f);
    }
    return [primary, advanced];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const renderField = (field: MessagingPlatformEnvVar) => {
    const meta = channelFieldMeta(field, fieldStrings);
    const current = draftEnv[field.key] ?? "";
    const setValue = (value: string) => {
      setDraftEnv((prev) => ({ ...prev, [field.key]: value }));
      setFieldErrors((prev) => {
        if (!prev[field.key]) return prev;
        const next = { ...prev };
        delete next[field.key];
        return next;
      });
    };

    // A yes/no answer gets a switch. It used to be a text box where the
    // correct thing to type was the word "true".
    if (meta.kind === "boolean") {
      const on = isTruthyEnv(current || (field.is_set ? "true" : ""));
      return (
        <label className="flex items-center justify-between gap-3" key={field.key}>
          <span className="min-w-0">
            <span className="block text-sm text-foreground">{meta.label}</span>
            {meta.hint && (
              <span className="block text-xs text-muted-foreground">{meta.hint}</span>
            )}
          </span>
          <Switch checked={on} onCheckedChange={(v) => setValue(v ? "true" : "false")} />
        </label>
      );
    }

    return (
      <div className="grid gap-1.5" key={field.key}>
        <Label htmlFor={`field-${field.key}`}>
          {meta.label}
          {field.required ? " *" : ""}
        </Label>
        {meta.hint && <span className="text-xs text-muted-foreground">{meta.hint}</span>}
        <Input
          id={`field-${field.key}`}
          type={meta.kind === "password" ? "password" : meta.kind === "number" ? "number" : "text"}
          // NEVER the variable name: an empty field beats WHATSAPP_HOME_CHANNEL.
          placeholder={field.is_set ? field.redacted_value || c.secretSet : ""}
          value={current}
          aria-invalid={Boolean(fieldErrors[field.key])}
          onChange={(e) => setValue(e.target.value)}
        />
        {fieldErrors[field.key] && (
          <span className="text-xs text-destructive">{fieldErrors[field.key]}</span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} />

      {/* Channel scope: system (global) × a specific agent's. Same pattern as
          Connectors; the messaging backend already resolves per profile. */}
      <div className="flex min-w-[220px] max-w-xs items-center gap-2">
        <Select value={scope} onValueChange={setScope} aria-label={t.connectors.agent}>
          <SelectOption value="global">{t.connectors.scopeGlobal}</SelectOption>
          {profiles
            .filter((p) => p.name !== "default")
            .map((p) => (
              <SelectOption key={p.name} value={p.name}>
                {t.connectors.agent}: {p.name}
              </SelectOption>
            ))}
        </Select>
      </div>

      {/* Restart banner — technical plumbing (gateway restart). Internal view
          (?full=1) only; for the user the restart is behind the scenes. */}
      {isInternalView() && restartNeeded && (
        <Card className="border-warning/50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <span>
                Changes are saved. Restart the gateway for them to take effect.
              </span>
            </div>
            <Button
              size="sm"
              className="uppercase shrink-0"
              onClick={handleRestart}
              disabled={restarting}
              prefix={restarting ? <Spinner /> : <RotateCw className="h-4 w-4" />}
            >
              {restarting ? "Restarting…" : "Restart now"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* "Gateway is not running" banner with the CLI command — technical
          jargon, hidden from the end user and visible only in the internal
          view (?full=1). */}
      {isInternalView() && !gatewayRunning && !restartNeeded && (
        <Card className="border-border">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              The gateway is not running. Configure channels here, then start the
              gateway with <code className="font-courier">{gatewayStartCommand}</code>{" "}
              (or the Restart button above).
            </span>
          </CardContent>
        </Card>
      )}

      {isInternalView() ? (
        <p className="text-xs text-muted-foreground">
          {configured} of {platforms.length} channels configured. Credentials are
          written to <code className="font-courier">{envPath}</code>; the
          gateway connects each enabled channel on its next restart.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {c.configuredCount
            .replace("{configured}", String(configured))
            .replace("{total}", String(platforms.length))}
        </p>
      )}

      {/* Config modal */}
      {editing && (
        <div
          ref={editModalRef}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 p-4"
          onClick={(e) => e.target === e.currentTarget && setEditing(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-config-title"
        >
          <div
            className={cn(
              themedBody,
              "relative w-full max-w-lg border border-border bg-card shadow-2xl flex flex-col max-h-[90vh]",
            )}
          >
            <Button
              ghost
              size="icon"
              onClick={() => setEditing(null)}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              aria-label={t.common.close}
            >
              <X />
            </Button>

            <header className="p-5 pb-3 border-b border-border">
              <h2
                id="channel-config-title"
                className="font-mondwest text-display text-base tracking-wider"
              >
                {c.configureTitle.replace("{name}", platformCopy(editing, c).name)}
              </h2>
              {/* The catalog leaves docs_url empty when the vendor has no
                  public setup page — then no link renders at all. */}
              {editing.docs_url && (
                <a
                  href={editing.docs_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {c.setupGuide} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </header>

            <div className="p-5 grid gap-4 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                {platformCopy(editing, c).description}
              </p>
              {/* Only what is needed to connect. Everything else waits behind
                  "Opções avançadas" — a channel used to open with six fields
                  and the first one asked the user to type "true". */}
              {primaryFields.map((field) => renderField(field))}

              {advancedFields.length > 0 && (
                <details className="rounded-xl border border-border bg-muted/25 px-3 py-2">
                  <summary className="cursor-pointer select-none text-xs text-muted-foreground">
                    {c.advancedOptions}
                  </summary>
                  <div className="grid gap-4 pt-3">
                    {advancedFields.map((field) => renderField(field))}
                  </div>
                </details>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button ghost size="sm" onClick={() => setEditing(null)}>
                  {t.common.cancel}
                </Button>
                <Button
                  className="uppercase"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  prefix={saving ? <Spinner /> : undefined}
                >
                  {saving ? c.saving : c.saveEnable}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Platform list */}
      <div className="grid gap-3">
        {visible.map((platform) => {
          const badge = stateBadge(platform.state, c);
          const copy = platformCopy(platform, c);
          const busy = togglingId === platform.id;
          return (
            <Card key={platform.id} className="border-border">
              <CardContent className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <ChannelLogo platform={platform} />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mondwest normal-case text-sm font-medium">
                          {copy.name}
                        </span>
                        <Badge tone={badge.tone} className={badge.className}>
                          {badge.label}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {copy.description}
                      </span>
                      {/* Raw runtime error message (startup_failed/fatal) —
                          technical plumbing, internal view (?full=1) only. */}
                      {isInternalView() && platform.error_message && (
                        <span className="text-xs text-destructive">
                          {platform.error_message}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    <div className="flex items-center gap-1.5">
                      {busy ? (
                        <Spinner className="text-sm" />
                      ) : (
                        <Switch
                          checked={platform.enabled}
                          onCheckedChange={() => void handleToggle(platform)}
                          aria-label={c.enableAria.replace("{name}", copy.name)}
                          // Um canal sem credencial não tem como atender. Deixar
                          // a chave ligável produzia o cartão que o dono viu: a
                          // chave acesa ao lado do selo "Não configurado" — dois
                          // fatos contraditórios no mesmo cartão. Quem manda é o
                          // botão Configurar ao lado.
                          disabled={!platform.configured}
                        />
                      )}
                    </div>
                    <Button
                      ghost
                      size="sm"
                      onClick={() => handleTest(platform)}
                      disabled={testingId === platform.id}
                      prefix={
                        testingId === platform.id ? (
                          <Spinner />
                        ) : (
                          <PlugZap className="h-4 w-4" />
                        )
                      }
                    >
                      {c.test}
                    </Button>
                    <Button
                      size="sm"
                      className="uppercase"
                      onClick={() => openConfig(platform)}
                      prefix={<Settings2 className="h-4 w-4" />}
                    >
                      {c.configure}
                    </Button>
                  </div>
                </div>
                {platform.id === "telegram" && (
                  <TelegramOnboardingPanel
                    onChanged={load}
                    onRestartNeeded={() => setRestartNeeded(true)}
                    platform={platform}
                    profile={profileParam}
                    setRestartNeeded={setRestartNeeded}
                    showToast={showToast}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Show more / less — user-facing only (under ?full=1 everything is already there). */}
      {!internal && extra.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {showMore ? c.showLess : `${c.showAll} (${extra.length})`}
        </button>
      )}
    </div>
  );
}

function TelegramOnboardingPanel({
  onChanged,
  onRestartNeeded,
  platform,
  profile,
  setRestartNeeded,
  showToast,
}: {
  onChanged: () => Promise<void>;
  onRestartNeeded: () => void;
  platform: MessagingPlatform;
  profile?: string;
  setRestartNeeded: (needed: boolean) => void;
  showToast: (message: string, type: "success" | "error") => void;
}) {
  const { t } = useI18n();
  const c = t.channels;
  const [setup, setSetup] = useState<TelegramOnboardingStartResponse | null>(
    null,
  );
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "starting" | "waiting" | "ready" | "applying"
  >("idle");
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [allowedIds, setAllowedIds] = useState<string[]>([]);
  const [detectedOwnerId, setDetectedOwnerId] = useState<string | null>(null);
  const [newAllowedId, setNewAllowedId] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!setup || phase !== "waiting") return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const status = await api.getTelegramOnboardingStatus(setup.pairing_id);
        if (cancelled) return;
        if (status.status === "ready") {
          setPhase("ready");
          setBotUsername(status.bot_username ?? null);
          setError("");
          if (
            status.owner_user_id &&
            TELEGRAM_USER_ID_RE.test(status.owner_user_id)
          ) {
            setDetectedOwnerId(status.owner_user_id);
            setAllowedIds([status.owner_user_id]);
          }
          return;
        }
        setError("");
        timeout = setTimeout(poll, 2000);
      } catch (pollError) {
        if (cancelled) return;

        const expiresAt = Date.parse(setup.expires_at);
        const expired =
          Number.isFinite(expiresAt) && Date.now() >= expiresAt;
        if (isTerminalTelegramOnboardingError(pollError) || expired) {
          setSetup(null);
          setQrDataUrl("");
          setPhase("idle");
          setError(c.tgPairingExpired);
          return;
        }

        setError(c.tgStillWaiting.replace("{error}", String(pollError)));
        timeout = setTimeout(poll, 2000);
      }
    };

    timeout = setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [phase, setup, c]);

  useEffect(() => {
    if (!setup) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [setup]);

  const resetSetup = () => {
    setSetup(null);
    setQrDataUrl("");
    setPhase("idle");
    setBotUsername(null);
    setAllowedIds([]);
    setDetectedOwnerId(null);
    setNewAllowedId("");
    setError("");
  };

  const start = async () => {
    setPhase("starting");
    setError("");
    setBotUsername(null);
    setAllowedIds([]);
    setDetectedOwnerId(null);
    setNewAllowedId("");
    try {
      const res = await api.startTelegramOnboarding({ bot_name: "Work4You" });
      const dataUrl = await QRCode.toDataURL(res.qr_payload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 224,
      });
      setSetup(res);
      setQrDataUrl(dataUrl);
      setPhase("waiting");
    } catch (startError) {
      setPhase("idle");
      setError(String(startError));
    }
  };

  const cancel = async () => {
    if (setup) {
      try {
        await api.cancelTelegramOnboarding(setup.pairing_id);
      } catch {
        /* local cleanup still wins */
      }
    }
    resetSetup();
  };

  const addAllowedId = () => {
    const trimmed = newAllowedId.trim();
    if (!TELEGRAM_USER_ID_RE.test(trimmed)) {
      setError(c.tgNumericOnly);
      return;
    }
    setError("");
    setAllowedIds((ids) => (ids.includes(trimmed) ? ids : [...ids, trimmed]));
    setNewAllowedId("");
  };

  // restart_started only means the `wayne gateway restart` child spawned —
  // not that the restart will succeed (e.g. systemd linger missing, service
  // manager failure). Poll the action status briefly and surface a non-zero
  // exit via the manual-restart banner. Note: in no-service installs the
  // child becomes the foreground gateway and never exits, so "still running
  // when the window closes" counts as success.
  const watchRestartOutcome = async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const st = await api.getActionStatus("gateway-restart", 5);
        if (st.running) continue;
        if (st.exit_code !== 0 && st.exit_code !== null) {
          onRestartNeeded();
          showToast(
            c.tgRestartFailedExit.replace("{code}", String(st.exit_code)),
            "error",
          );
        }
        return;
      } catch {
        // transient fetch error; keep polling
      }
    }
  };

  const apply = async () => {
    if (!setup) return;
    if (allowedIds.length === 0) {
      setError(c.tgNeedOneUser);
      return;
    }
    setPhase("applying");
    setError("");
    try {
      const result = await api.applyTelegramOnboarding(setup.pairing_id, {
        allowed_user_ids: allowedIds,
        profile,
      });
      resetSetup();
      if (result.restart_started) {
        showToast(c.tgSaved, "success");
        setRestartNeeded(false);
        setTimeout(() => void onChanged(), 4000);
        void watchRestartOutcome();
      } else if (result.restart_started === undefined && result.needs_restart) {
        try {
          await api.restartGateway();
          showToast(c.tgSaved, "success");
          setRestartNeeded(false);
          setTimeout(() => void onChanged(), 4000);
        } catch (restartError) {
          onRestartNeeded();
          showToast(
            c.tgSavedRestartFailed.replace("{error}", String(restartError)),
            "error",
          );
        }
      } else {
        onRestartNeeded();
        showToast(
          c.tgSavedRestartFailed.replace("{error}", result.restart_error || "—"),
          "error",
        );
      }
      await onChanged();
    } catch (applyError) {
      setPhase("ready");
      setError(String(applyError));
    }
  };

  const expiresIn = useMemo(
    () => (setup ? formatExpiry(setup.expires_at) : null),
    // tick keeps the memo fresh without recalculating on every render branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setup, tick],
  );

  return (
    <div className="rounded-sm border border-border bg-background/35 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="uppercase"
          onClick={() => void start()}
          disabled={phase === "starting" || phase === "waiting" || phase === "applying"}
          prefix={phase === "starting" ? <Spinner /> : <QrCode className="h-4 w-4" />}
        >
          {phase === "starting" ? c.tgStarting : c.tgSetupQr}
        </Button>
        {platform.configured && (
          <span className="text-xs text-muted-foreground">
            {c.tgAlreadySet}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {setup && qrDataUrl && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid gap-3">
            {(phase === "ready" || phase === "applying") && (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success" className={SUCCESS_BADGE_CLASS}>
                    {c.tgReady}
                  </Badge>
                  {botUsername && (
                    <span className="font-courier text-sm text-muted-foreground">
                      @{botUsername}
                    </span>
                  )}
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      {c.tgAllowedUsers}
                    </span>
                    {detectedOwnerId && allowedIds.includes(detectedOwnerId) && (
                      <Badge tone="success" className={SUCCESS_BADGE_CLASS}>
                        {c.tgOwnerDetected}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allowedIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="inline-flex items-center gap-1 border border-border px-2 py-1 font-courier text-xs text-foreground hover:border-destructive/50"
                        onClick={() =>
                          setAllowedIds((ids) =>
                            ids.filter((existing) => existing !== id),
                          )
                        }
                      >
                        {id}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                    {allowedIds.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        {c.tgNeedOneUser}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={newAllowedId}
                    onChange={(event) => setNewAllowedId(event.target.value)}
                    placeholder={c.tgUserIdPlaceholder}
                    className="font-courier"
                  />
                  <Button size="sm" outlined onClick={addAllowedId} prefix={<Check />}>
                    {c.tgAdd}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="uppercase"
                    onClick={() => void apply()}
                    disabled={phase === "applying"}
                    prefix={phase === "applying" ? <Spinner /> : <Save className="h-4 w-4" />}
                  >
                    {phase === "applying" ? c.saving : t.common.save}
                  </Button>
                  <Button size="sm" ghost onClick={() => void cancel()}>
                    {t.common.cancel}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center gap-3">
            <img
              src={qrDataUrl}
              alt={c.tgQrAlt}
              className="h-56 w-56 bg-white p-2"
            />
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <Badge tone={expiresIn === null ? "destructive" : "outline"}>
                {expiresIn ?? c.tgExpired}
              </Badge>
              {phase === "waiting" && <Badge tone="warning">{c.tgWaiting}</Badge>}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={setup.deep_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 border border-border px-3 text-xs uppercase text-foreground hover:border-foreground/40"
              >
                <ExternalLink className="h-4 w-4" />
                {c.tgOpenTelegram}
              </a>
              <Button size="sm" ghost onClick={() => void cancel()}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
