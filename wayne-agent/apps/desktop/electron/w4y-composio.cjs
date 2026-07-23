/**
 * w4y-composio.cjs — write mcp_servers.composio + bootstrap after login.
 * Ported from desktop-shell (0.3.4 broker). Values are never logged.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { cloudApiRequest } = require("./w4y-cloud.cjs");

function resolveWayneHome() {
  if (process.env.WAYNE_HOME) return path.resolve(process.env.WAYNE_HOME);
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "wayne");
  }
  return path.join(os.homedir(), ".wayne");
}

function upsertEnvKeyLocal(key, value) {
  const file = path.join(resolveWayneHome(), ".env");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    text = "";
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  const next = re.test(text) ? text.replace(re, line) : text ? `${text.replace(/\s*$/, "")}\n${line}\n` : `${line}\n`;
  fs.writeFileSync(file, next, "utf8");
  return { ok: true };
}

function upsertComposioMcpServer(rawUrl, wayneHome = resolveWayneHome()) {
  const url = String(rawUrl || "").trim();
  if (!/^https:\/\/[\x21-\x7e]+$/.test(url) || /["'#\\]/.test(url)) {
    return { ok: false, error: "invalid-url" };
  }
  try {
    const file = path.join(wayneHome, "config.yaml");
    let raw = "";
    let existed = false;
    try {
      raw = fs.readFileSync(file, "utf8");
      existed = true;
    } catch {
      /* no config yet */
    }
    const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
    const body = bom ? raw.slice(1) : raw;
    const eol = body.includes("\r\n") ? "\r\n" : "\n";
    const lines = body.length ? body.split(/\r\n|\n/) : [];
    const isBlank = (s) => /^\s*(#.*)?$/.test(s);
    const indentOf = (s) => (s.match(/^[ \t]*/) || [""])[0].length;

    let mcpIdx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^mcp_servers\s*:\s*(#.*)?$/.test(lines[i])) {
        mcpIdx = i;
        break;
      }
    }
    let sectionEnd = lines.length;
    let composioIdx = -1;
    if (mcpIdx !== -1) {
      for (let i = mcpIdx + 1; i < lines.length; i += 1) {
        if (!isBlank(lines[i]) && indentOf(lines[i]) === 0) {
          sectionEnd = i;
          break;
        }
      }
      for (let i = mcpIdx + 1; i < sectionEnd; i += 1) {
        if (/^[ \t]+composio\s*:\s*(#.*)?$/.test(lines[i])) {
          composioIdx = i;
          break;
        }
      }
    }

    const out = lines.slice();
    if (composioIdx !== -1) {
      const cIndent = indentOf(lines[composioIdx]);
      let blockEnd = sectionEnd;
      for (let i = composioIdx + 1; i < sectionEnd; i += 1) {
        if (!isBlank(lines[i]) && indentOf(lines[i]) <= cIndent) {
          blockEnd = i;
          break;
        }
      }
      let urlIdx = -1;
      for (let i = composioIdx + 1; i < blockEnd; i += 1) {
        if (indentOf(lines[i]) > cIndent && /^[ \t]+url\s*:/.test(lines[i])) {
          urlIdx = i;
          break;
        }
      }
      if (urlIdx !== -1) {
        const keep = (lines[urlIdx].match(/^[ \t]*/) || [""])[0];
        out[urlIdx] = `${keep}url: ${url}`;
      } else {
        out.splice(composioIdx + 1, 0, `${" ".repeat(cIndent + 2)}url: ${url}`);
      }
    } else {
      const blockLines = (indent) => [
        `${indent}composio:`,
        `${indent}  url: ${url}`,
        `${indent}  headers:`,
        `${indent}    x-api-key: ` + "${COMPOSIO_API_KEY}",
        `${indent}  enabled: true`,
      ];
      if (mcpIdx !== -1) {
        let childIndent = 2;
        for (let i = mcpIdx + 1; i < sectionEnd; i += 1) {
          if (!isBlank(lines[i])) {
            childIndent = indentOf(lines[i]);
            break;
          }
        }
        out.splice(mcpIdx + 1, 0, ...blockLines(" ".repeat(childIndent)));
      } else {
        while (out.length && out[out.length - 1].trim() === "") out.pop();
        out.push("mcp_servers:", ...blockLines("  "));
      }
    }

    const result = bom + out.join(eol) + eol;
    const urlCount = result.split(url).length - 1;
    if (urlCount !== 1 || !/(^|\n)[ \t]+composio\s*:/.test(result) || out.length < lines.length) {
      return { ok: false, error: "sanity-check-failed" };
    }
    if (existed) {
      try {
        fs.copyFileSync(file, file + ".bak");
      } catch {
        /* backup best-effort */
      }
    }
    fs.mkdirSync(wayneHome, { recursive: true });
    fs.writeFileSync(file, result, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, error: "write-failed" };
  }
}

async function bootstrapLocalConnectors() {
  try {
    const res = await cloudApiRequest({
      method: "GET",
      path: "/api/device/connector-bootstrap",
    });
    if (!res.ok || !res.json) return false;
    const key =
      typeof res.json.composio_key === "string" ? res.json.composio_key.trim() : "";
    const mcpUrl = typeof res.json.mcp_url === "string" ? res.json.mcp_url.trim() : "";
    let wrote = false;
    if (key) {
      try {
        upsertEnvKeyLocal("COMPOSIO_API_KEY", key);
        wrote = true;
      } catch {
        /* ignore */
      }
    }
    if (mcpUrl) wrote = upsertComposioMcpServer(mcpUrl).ok || wrote;
    return wrote;
  } catch {
    return false;
  }
}

module.exports = {
  bootstrapLocalConnectors,
  upsertComposioMcpServer,
};
