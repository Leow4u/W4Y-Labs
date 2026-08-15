---
name: composio-connect
description: Connect Composio apps in chat via Connect Links.
category: productivity
tags:
  - composio
  - connectors
  - oauth
  - apollo
  - gmail
  - linkedin
  - connect
tools:
  - mcp_composio_COMPOSIO_MANAGE_CONNECTIONS
---

# Composio Connect (chat)

When the user asks to **connect / authorize / link** an app (Apollo, Gmail,
LinkedIn, Slack, etc.), drive OAuth **in this chat** with Composio MCP.
Do not send them to the Conectores marketplace as the primary path.

Work4You uses Composio as the connector plane for third-party apps. Native
Work4You toolsets (browser, terminal, file, …) are separate and stay available.

## When to Use

- "Quero conectar o Apollo"
- "Connect my Gmail"
- "Conecte meu LinkedIn"
- Any request to add/authorize a Composio toolkit account

## When NOT to Use Composio

Generic web and browsing use **native Work4You tools**, not Composio:

- Read page text / search the web → ``web_extract``, ``web_search``
- Open a site in the Browser panel, JS-heavy pages, screenshots →
  ``browser_navigate`` → ``browser_snapshot`` (or ``browser_vision``)
- Do **not** use Composio ``SEARCH_FETCH_URL``, ``BROWSER_TOOL_*``, or
  similar meta fetch/browser tools for these — they skip the desktop Browser
  panel and duplicate native capability.

Composio is for **connected OAuth apps** (Gmail, Apollo, Slack, …) after
``MANAGE_CONNECTIONS`` reports an active account.

## Procedure

1. **Immediately** call `mcp_composio_COMPOSIO_MANAGE_CONNECTIONS` with the
   toolkit slug (`apollo`, `gmail`, `linkedin`, …).
   **Do not** call `SEARCH_TOOLS`, `GET_TOOL_SCHEMAS`, or `MULTI_EXECUTE_TOOL`
   first on a connect request — those are for *using* an already-connected app.
2. If the tool returns a **Connect Link**
   (`https://connect.composio.dev/link/...`, `https://dashboard.composio.dev/link/...`,
   or `https://app.composio.dev/link/...`), paste it **verbatim** in your reply
   as a markdown link, e.g.:

   👉 [Authorize Apollo](https://connect.composio.dev/link/XXXX)

   The desktop turns that URL into an Authorize card. Do not paraphrase or
   hide the URL.
3. Tell the user to click Authorize and wait. Do **not** claim the app is
   connected until auth completes (or the tool reports an ACTIVE account).
4. After they finish, optionally re-check with
   `mcp_composio_COMPOSIO_MANAGE_CONNECTIONS` before running app actions via
   `SEARCH_TOOLS` / `MULTI_EXECUTE_TOOL`.

## Pitfalls

- A toolkit listed as "available" with empty accounts is **not** connected —
  still issue a Connect Link.
- Composio may report an old `ACTIVE` account id while the user cannot use the
  app (expired/revoked token). If they ask to **connect** again, mint a fresh
  Connect Link anyway — do not stop at "already connected".
- Never install Python `composio` packages or curl the tool-router URL.
- Never print `COMPOSIO_API_KEY`.
