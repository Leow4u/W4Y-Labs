"""OSS provider definitions for LLM, embedder, and vector store."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


def _work4you_home() -> Path:
    """Resolve the Work4You home the same way the engine does.

    Prefers ``work4you_constants``; the stdlib fallback mirrors it, including
    the brand migration (the default root moved from ``~/.wayne`` to
    ``~/.work4you``). A hard-coded ``~/.wayne`` would point at an empty
    directory once a user's data has been migrated.
    """
    try:
        from work4you_constants import get_wayne_home

        return get_wayne_home()
    except (ModuleNotFoundError, ImportError):
        pass
    val = (os.environ.get("WAYNE_HOME") or os.environ.get("WORK4YOU_HOME") or "").strip()
    if val:
        return Path(val).expanduser()
    new_root, legacy_root = Path.home() / ".work4you", Path.home() / ".wayne"
    return legacy_root if (legacy_root.is_dir() and not new_root.is_dir()) else new_root


LLM_PROVIDERS: dict[str, dict[str, Any]] = {
    "openai": {
        "label": "OpenAI",
        "needs_key": True,
        "env_var": "OPENAI_API_KEY",
        "default_model": "gpt-5-mini",
    },
    "ollama": {
        "label": "Ollama (local)",
        "needs_key": False,
        "default_model": "llama3.1:8b",
        "default_url": "http://localhost:11434",
        "pip_dep": "ollama",
    },
}

EMBEDDER_PROVIDERS: dict[str, dict[str, Any]] = {
    "openai": {
        "label": "OpenAI",
        "needs_key": True,
        "env_var": "OPENAI_API_KEY",
        "default_model": "text-embedding-3-small",
        "dims": 1536,
    },
    "ollama": {
        "label": "Ollama (local)",
        "needs_key": False,
        "default_model": "nomic-embed-text",
        "default_url": "http://localhost:11434",
        "dims": 768,
        "pip_dep": "ollama",
    },
}

VECTOR_PROVIDERS: dict[str, dict[str, Any]] = {
    "qdrant": {
        "label": "Qdrant",
        "default_config": {"path": str(_work4you_home() / "mem0_qdrant")},
        "pip_dep": "qdrant-client",
    },
    "pgvector": {
        "label": "PGVector",
        "default_config": {"host": "localhost", "port": 5432, "user": os.getenv("USER", "postgres"), "dbname": "postgres"},
        "pip_dep": "psycopg2-binary",
    },
}

KNOWN_DIMS: dict[str, int] = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
    "nomic-embed-text": 768,
}


def validate_oss_config(oss_config: dict) -> list[str]:
    """Validate an OSS config dict. Returns list of error strings (empty = valid)."""
    errors: list[str] = []

    for section, registry in [("llm", LLM_PROVIDERS), ("embedder", EMBEDDER_PROVIDERS),
                               ("vector_store", VECTOR_PROVIDERS)]:
        block = oss_config.get(section)
        if not block or not isinstance(block, dict):
            errors.append(f"Missing required section: {section}")
            continue
        provider_id = block.get("provider", "")
        if provider_id not in registry:
            valid = ", ".join(registry.keys())
            errors.append(f"Unknown {section} provider '{provider_id}'. Valid: {valid}")

    vs = oss_config.get("vector_store", {})
    if vs.get("provider") == "pgvector":
        cfg = vs.get("config", {})
        if not cfg.get("user"):
            errors.append("PGVector requires 'user' in vector_store.config")

    return errors
