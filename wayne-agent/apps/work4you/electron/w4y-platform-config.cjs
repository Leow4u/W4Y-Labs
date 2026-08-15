/**
 * w4y-platform-config.cjs — seed Work4You platform model defaults into
 * the active account's config.yaml (mirrors work4you_cli/platform_tenant.py
 * + relay_free_model.py). No YAML dependency — surgical line edits only.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RELAY_FREE_PRIMARY = "qwen/qwen3.7-flash";
const RELAY_FREE_FALLBACK = "openai/gpt-oss-20b";
const RELAY_FREE_REASONING = "medium";
const OPENROUTER = "openrouter";
const PAID_AUTO = "openrouter/auto";

function normalizePlan(raw) {
  const p = String(raw || "").trim().toLowerCase();
  if (p === "starter" || p === "essencial") return "starter";
  if (p === "pro" || p === "plus") return "pro";
  if (p === "max" || p === "business") return "max";
  return "free";
}

function isGratisPlan(raw) {
  return normalizePlan(raw) === "free";
}

function isStaleDefault(modelId, plan) {
  const mid = String(modelId || "").trim().toLowerCase();
  if (!mid) return true;
  if (mid.includes("nemotron") || mid.endsWith(":free")) return true;
  if (isGratisPlan(plan) && mid !== RELAY_FREE_PRIMARY && !mid.endsWith("/qwen3.7-flash")) {
    if (mid === "openrouter/auto" || mid.endsWith("/auto")) return true;
    if (mid.includes("claude") || mid.includes("gpt-") || mid.includes("gemini")) return true;
  }
  return false;
}

function readModelField(raw, field) {
  const modelIdx = raw.search(/^model\s*:/m);
  if (modelIdx < 0) return "";
  const after = raw.slice(modelIdx);
  const nextTop = after.search(/\n[A-Za-z_][A-Za-z0-9_]*\s*:/);
  const block = nextTop >= 0 ? after.slice(0, nextTop) : after;
  const re = new RegExp("^[ \\t]+" + field + "\\s*:\\s*([^#\\r\\n]+)", "m");
  const m = block.match(re);
  return m ? String(m[1] || "").trim().replace(/^["']|["']$/g, "") : "";
}

function stripTopLevelKey(raw, key) {
  const lines = raw.length ? raw.split(/\r\n|\n/) : [];
  const out = [];
  let i = 0;
  const keyRe = new RegExp("^" + key + "\\s*:");
  while (i < lines.length) {
    if (keyRe.test(lines[i])) {
      i += 1;
      while (i < lines.length) {
        const line = lines[i];
        if (line.trim() === "" || /^\s/.test(line) || line.trim().startsWith("#")) {
          i += 1;
          continue;
        }
        if (/^[A-Za-z_]/.test(line)) break;
        i += 1;
      }
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n");
}

function platformModelBlock(plan) {
  const model = isGratisPlan(plan) ? RELAY_FREE_PRIMARY : PAID_AUTO;
  return [
    "model:",
    "  default: " + model,
    "  provider: " + OPENROUTER,
    "agent:",
    "  reasoning_effort: " + RELAY_FREE_REASONING,
    "fallback_model:",
    "  - provider: " + OPENROUTER,
    "    model: " + RELAY_FREE_FALLBACK,
  ].join("\n");
}

function ensurePlatformModelConfig(wayneHome, plan) {
  const home = String(wayneHome || "").trim();
  if (!home) return { ok: false, wrote: false, path: "" };
  const file = path.join(home, "config.yaml");
  fs.mkdirSync(home, { recursive: true });

  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    raw = "";
  }
  const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = bom ? raw.slice(1) : raw;
  const currentDefault = readModelField(body, "default");
  const currentProvider = readModelField(body, "provider");
  const needsReset =
    !body.trim() ||
    !currentProvider ||
    currentProvider === '""' ||
    currentProvider === "''" ||
    isStaleDefault(currentDefault, plan);

  if (!needsReset && currentProvider === OPENROUTER) {
    return { ok: true, wrote: false, path: file };
  }

  let next = body;
  if (needsReset) {
    next = stripTopLevelKey(next, "model");
    next = stripTopLevelKey(next, "fallback_model");
    const model = isGratisPlan(plan) ? RELAY_FREE_PRIMARY : PAID_AUTO;
    const block = [
      "model:",
      "  default: " + model,
      "  provider: " + OPENROUTER,
      "fallback_model:",
      "  - provider: " + OPENROUTER,
      "    model: " + RELAY_FREE_FALLBACK,
    ].join("\n");
    if (!next.trim()) {
      next = block + "\nagent:\n  reasoning_effort: " + RELAY_FREE_REASONING + "\n";
    } else {
      next = block + "\n" + next.trim() + "\n";
    }
  } else if (!/^model\s*:/m.test(next)) {
    next = platformModelBlock(plan) + "\n" + next.trim() + "\n";
  } else {
    next = next.replace(/^model\s*:\s*$/m, "model:\n  provider: " + OPENROUTER);
    if (!/^[ \t]+provider\s*:/m.test(next)) {
      next = next.replace(/^model\s*:/m, "model:\n  provider: " + OPENROUTER);
    }
  }

  fs.writeFileSync(file, bom + next.replace(/\s*$/, "\n"), "utf8");
  return { ok: true, wrote: true, path: file };
}

module.exports = {
  RELAY_FREE_PRIMARY,
  OPENROUTER,
  ensurePlatformModelConfig,
  isGratisPlan,
  normalizePlan,
  isStaleDefault,
};
