"""Tests for Composio vs native web/browser routing."""

from tools.composio_routing import (
    apply_composio_native_routing,
    composio_action_segment,
    should_drop_composio_duplicate,
)


def _tool(name: str, desc: str = "desc") -> dict:
    return {"type": "function", "function": {"name": name, "description": desc}}


def test_composio_action_segment_strips_prefix():
    assert composio_action_segment("mcp_composio_COMPOSIO_SEARCH_TOOLS") == "SEARCH_TOOLS"
    assert composio_action_segment("mcp_composio_agente_COMPOSIO_MANAGE_CONNECTIONS") == "MANAGE_CONNECTIONS"
    assert composio_action_segment("browser_navigate") is None


def test_drops_fetch_url_duplicate_when_native_web_on():
    natives = {"web_extract", "web_search", "browser_navigate"}
    assert should_drop_composio_duplicate(
        "mcp_composio_COMPOSIO_SEARCH_FETCH_URL_CONTENT", natives,
    )
    assert not should_drop_composio_duplicate("mcp_composio_GMAIL_SEND_EMAIL", natives)
    assert not should_drop_composio_duplicate("mcp_composio_COMPOSIO_SEARCH_TOOLS", natives)


def test_drops_browser_duplicate_when_native_browser_on():
    natives = {"browser_navigate", "browser_snapshot"}
    assert should_drop_composio_duplicate("mcp_composio_COMPOSIO_BROWSER_TOOL_CREATE_TASK", natives)
    assert should_drop_composio_duplicate("mcp_composio_BROWSE_A_WEBSITE", natives)


def test_keeps_composio_when_natives_missing():
    assert not should_drop_composio_duplicate(
        "mcp_composio_COMPOSIO_SEARCH_FETCH_URL_CONTENT", {"terminal"},
    )


def test_apply_filters_and_augments_meta_tools():
    defs = [
        _tool("web_extract"),
        _tool("browser_navigate"),
        _tool("mcp_composio_COMPOSIO_SEARCH_FETCH_URL_CONTENT"),
        _tool("mcp_composio_GMAIL_FETCH_EMAILS"),
        _tool("mcp_composio_COMPOSIO_SEARCH_TOOLS", "Find tools."),
        _tool("mcp_composio_COMPOSIO_MANAGE_CONNECTIONS", "Connect apps."),
    ]
    natives = {d["function"]["name"] for d in defs if not d["function"]["name"].startswith("mcp_")}

    out, names = apply_composio_native_routing(defs, natives)

    assert "mcp_composio_COMPOSIO_SEARCH_FETCH_URL_CONTENT" not in names
    assert "mcp_composio_GMAIL_FETCH_EMAILS" in names
    assert "mcp_composio_COMPOSIO_MANAGE_CONNECTIONS" in names

    search = next(t for t in out if t["function"]["name"] == "mcp_composio_COMPOSIO_SEARCH_TOOLS")
    assert "web_extract" in search["function"]["description"]
    assert "browser_navigate" in search["function"]["description"]

    manage = next(t for t in out if t["function"]["name"] == "mcp_composio_COMPOSIO_MANAGE_CONNECTIONS")
    assert "web_extract" not in manage["function"]["description"]
