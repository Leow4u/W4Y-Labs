"""Route generic web/browser work to native Wayne tools when Composio MCP is loaded.

Composio's tool-router exposes meta-tools and generic fetch/browser helpers alongside
OAuth app connectors (Gmail, Apollo, …). When native ``web_*`` / ``browser_*`` tools
are available, those Composio duplicates confuse the model and bypass the desktop
Browser panel (which only tracks native ``browser_*`` calls).

This module filters duplicate Composio tools from ``get_tool_definitions()`` and
augments the remaining meta-tools with routing hints. Per-app connector tools
(``GMAIL_*``, ``APOLLO_*``, …) are never touched.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Set

_COMPOSIO_PREFIXES = ("mcp_composio_agente_", "mcp_composio_")

# Meta-tools kept for connector OAuth + app actions; never dropped here.
_META_TOOL_ACTIONS = frozenset({
    "SEARCH_TOOLS",
    "MULTI_EXECUTE",
    "MULTI_EXECUTE_TOOL",
    "MANAGE_CONNECTIONS",
    "EXECUTE_TOOL",
    "GET_TOOL_SCHEMAS",
})

# Composio slugs that duplicate native read-only web fetch when web toolset is on.
_WEB_DUPLICATE_RE = re.compile(
    r"(?:SEARCH_)?FETCH_URL|FETCH_URL_CONTENT|SCRAPE_URL|EXA_SEARCH|WEB_FETCH",
    re.IGNORECASE,
)

# Composio slugs that duplicate native browser automation when browser toolset is on.
_BROWSER_DUPLICATE_RE = re.compile(
    r"BROWSER_TOOL|BROWSE_.*WEBSITE|BROWSER_NAVIGATE|COMPOSIO_BROWSER|WEB_BROWSE",
    re.IGNORECASE,
)

_NATIVE_WEB_TOOLS = frozenset({"web_search", "web_extract"})
_NATIVE_BROWSER_ANCHOR = "browser_navigate"

_COMPOSIO_NATIVE_ROUTING_HINT = (
    " Native Work4You tools handle generic URLs and browsing: use "
    "`web_extract` / `web_search` for read-only page content and "
    "`browser_navigate` → `browser_snapshot` when the user wants the "
    "Browser panel or JavaScript-rendered pages. Reserve Composio for "
    "connected OAuth apps (Gmail, Apollo, Slack, …) — not generic web."
)


def composio_action_segment(prefixed_tool_name: str) -> str | None:
    """Return the Composio action segment from a prefixed MCP tool name, or None."""
    name = prefixed_tool_name or ""
    for prefix in _COMPOSIO_PREFIXES:
        if not name.startswith(prefix):
            continue
        segment = name[len(prefix):]
        if segment.upper().startswith("COMPOSIO_"):
            segment = segment[len("COMPOSIO_"):]
        return segment.upper()
    return None


def is_composio_mcp_tool(prefixed_tool_name: str) -> bool:
    return composio_action_segment(prefixed_tool_name) is not None


def _has_native_web(available_tool_names: Set[str]) -> bool:
    return bool(_NATIVE_WEB_TOOLS & available_tool_names)


def _has_native_browser(available_tool_names: Set[str]) -> bool:
    return _NATIVE_BROWSER_ANCHOR in available_tool_names


def should_drop_composio_duplicate(
    prefixed_tool_name: str,
    available_tool_names: Set[str],
) -> bool:
    """True when this Composio tool duplicates an available native web/browser tool."""
    segment = composio_action_segment(prefixed_tool_name)
    if not segment:
        return False
    if segment in _META_TOOL_ACTIONS:
        return False

    if _has_native_web(available_tool_names) and _WEB_DUPLICATE_RE.search(segment):
        return True
    if _has_native_browser(available_tool_names) and _BROWSER_DUPLICATE_RE.search(segment):
        return True
    return False


def filter_composio_web_duplicates(
    tool_defs: List[Dict[str, Any]],
    available_tool_names: Set[str],
) -> List[Dict[str, Any]]:
    """Drop Composio MCP tools that duplicate native web/browser when natives are on."""
    if not (_has_native_web(available_tool_names) or _has_native_browser(available_tool_names)):
        return tool_defs

    kept: List[Dict[str, Any]] = []
    for td in tool_defs:
        name = td.get("function", {}).get("name", "")
        if should_drop_composio_duplicate(name, available_tool_names):
            continue
        kept.append(td)
    return kept


def _augment_description(desc: str, hint: str) -> str:
    desc = (desc or "").rstrip()
    if hint.strip() in desc:
        return desc
    return f"{desc}{hint}"


def augment_composio_meta_tool_hints(
    tool_defs: List[Dict[str, Any]],
    available_tool_names: Set[str],
) -> List[Dict[str, Any]]:
    """Add native-routing hints to Composio meta-tools when web/browser natives exist."""
    if not (_has_native_web(available_tool_names) or _has_native_browser(available_tool_names)):
        return tool_defs

    hint_targets = {"SEARCH_TOOLS", "MULTI_EXECUTE", "MULTI_EXECUTE_TOOL", "EXECUTE_TOOL"}
    out: List[Dict[str, Any]] = []
    for td in tool_defs:
        fn = td.get("function") or {}
        name = fn.get("name", "")
        segment = composio_action_segment(name)
        if segment in hint_targets:
            desc = _augment_description(fn.get("description", ""), _COMPOSIO_NATIVE_ROUTING_HINT)
            out.append({"type": "function", "function": {**fn, "description": desc}})
        else:
            out.append(td)
    return out


def apply_composio_native_routing(
    tool_defs: List[Dict[str, Any]],
    available_tool_names: Set[str],
) -> tuple[List[Dict[str, Any]], Set[str]]:
    """Filter duplicates then augment meta-tool descriptions; returns updated name set."""
    filtered = filter_composio_web_duplicates(tool_defs, available_tool_names)
    names_after_filter = {t["function"]["name"] for t in filtered}
    augmented = augment_composio_meta_tool_hints(filtered, available_tool_names)
    return augmented, {t["function"]["name"] for t in augmented}
