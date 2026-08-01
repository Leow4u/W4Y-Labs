"""Per-agent knowledge base (K1) on the holographic memory store.

An agent's knowledge base is a folder of documents next to the profile
(``<profile>/knowledge/``) whose TEXT is chunked into facts of the profile's
holographic ``memory_store.db``. Retrieval then rides the provider's native
per-turn prefetch — no new retrieval engine.

Two conventions carry what the fact store lacks natively (no source column):
  - every chunk is stored as ``[fonte: <filename>] <chunk>`` so the SOURCE
    reaches the model inside the content itself (prefetch emits only content,
    so this is the honest citation path);
  - every chunk is tagged ``src:<filename>`` so a document can be removed
    fact-by-fact later.

Supported formats: .txt .md .markdown .csv .json .log natively, plus
.docx/.xlsx/.ipynb via ``tools.read_extract``. PDF is intentionally NOT
supported yet (no PDF dependency in the engine lock); callers get a clear
error instead of a silent empty ingest.
"""
from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

_log = logging.getLogger("wayne.knowledge")

KNOWLEDGE_CATEGORY = "knowledge"
SOURCE_TAG_PREFIX = "src:"
KNOWLEDGE_DIRNAME = "knowledge"
MANIFEST_NAME = "manifest.json"

# Chunking: paragraph-merge to a target size. Small enough that a fact reads
# as one idea, large enough that retrieval carries context.
CHUNK_TARGET_CHARS = 700
CHUNK_MAX_CHARS = 1100
MAX_CHUNKS_PER_FILE = 400
MAX_FILE_BYTES = 15 * 1024 * 1024

PLAIN_TEXT_SUFFIXES = {".txt", ".md", ".markdown", ".csv", ".json", ".log"}
EXTRACTABLE_SUFFIXES = {".docx", ".xlsx", ".ipynb"}
UNSUPPORTED_HINT = {".doc", ".ppt", ".pptx"}


class KnowledgeError(Exception):
    """User-facing ingestion error (bad format, empty text, oversized)."""


def knowledge_dir(profile_dir: Path) -> Path:
    return Path(profile_dir) / KNOWLEDGE_DIRNAME


def _manifest_path(profile_dir: Path) -> Path:
    return knowledge_dir(profile_dir) / MANIFEST_NAME


def _load_manifest(profile_dir: Path) -> Dict[str, Any]:
    path = _manifest_path(profile_dir)
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("files"), dict):
                return data
        except Exception:
            _log.exception("unreadable knowledge manifest at %s", path)
    return {"files": {}}


def _save_manifest(profile_dir: Path, manifest: Dict[str, Any]) -> None:
    path = _manifest_path(profile_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _memory_store(profile_dir: Path):
    """The profile's holographic fact store (auto-creates memory_store.db)."""
    try:
        from plugins.memory.holographic.store import MemoryStore  # type: ignore
    except ImportError:
        # Engine layouts where the repo root is not on sys.path: resolve the
        # bundled plugin by file location (work4you_cli/ -> repo root).
        import importlib.util

        store_py = (
            Path(__file__).resolve().parent.parent
            / "plugins" / "memory" / "holographic" / "store.py"
        )
        spec = importlib.util.spec_from_file_location(
            "w4y_holographic_store", store_py
        )
        if spec is None or spec.loader is None:
            raise KnowledgeError("holographic memory plugin not found")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        MemoryStore = module.MemoryStore  # type: ignore
    return MemoryStore(db_path=Path(profile_dir) / "memory_store.db")


def sanitize_filename(name: str) -> str:
    base = Path(name or "").name.strip()
    base = re.sub(r"[^\w.\- ()\[\]]", "_", base)
    return base[:120]


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in PLAIN_TEXT_SUFFIXES:
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix in EXTRACTABLE_SUFFIXES:
        from tools.read_extract import extract_document_text

        return extract_document_text(str(path)) or ""
    if suffix == ".pdf":
        # Lazy import: installs without pypdf (older venvs) degrade to the
        # same clear refusal instead of a crash. Scanned/image-only PDFs
        # yield no text and surface as empty_text.
        try:
            from pypdf import PdfReader  # type: ignore
        except ImportError:
            raise KnowledgeError("unsupported_format:pdf")
        try:
            reader = PdfReader(str(path))
            pages = []
            for page in reader.pages[:300]:
                try:
                    pages.append(page.extract_text() or "")
                except Exception:
                    continue
            return "\n\n".join(p for p in pages if p.strip())
        except KnowledgeError:
            raise
        except Exception as exc:
            _log.exception("pdf extraction failed for %s", path)
            raise KnowledgeError(f"pdf_error:{exc}")
    if suffix in UNSUPPORTED_HINT:
        raise KnowledgeError(f"unsupported_format:{suffix.lstrip('.')}")
    raise KnowledgeError(f"unsupported_format:{suffix.lstrip('.') or 'sem-extensao'}")


def chunk_text(text: str) -> List[str]:
    """Merge paragraphs up to the target size; hard-split oversized blocks."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    current = ""
    for para in paragraphs:
        # Hard-split monolithic blocks (minified logs, single-line CSV…).
        while len(para) > CHUNK_MAX_CHARS:
            head, para = para[:CHUNK_MAX_CHARS], para[CHUNK_MAX_CHARS:]
            if current:
                chunks.append(current)
                current = ""
            chunks.append(head)
        if current and len(current) + len(para) + 2 > CHUNK_TARGET_CHARS:
            chunks.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        chunks.append(current)
    return chunks[:MAX_CHUNKS_PER_FILE]


def list_documents(profile_dir: Path) -> List[Dict[str, Any]]:
    manifest = _load_manifest(profile_dir)
    out = []
    for name, meta in sorted(manifest.get("files", {}).items()):
        entry = {"name": name}
        if isinstance(meta, dict):
            entry.update({
                "size": meta.get("size"),
                "facts": meta.get("facts"),
                "ingested_at": meta.get("ingested_at"),
            })
        out.append(entry)
    return out


def ingest_file(profile_dir: Path, filename: str) -> Dict[str, Any]:
    """Extract → chunk → store facts for one file already in knowledge/."""
    profile_dir = Path(profile_dir)
    safe = sanitize_filename(filename)
    path = knowledge_dir(profile_dir) / safe
    if not path.exists():
        raise KnowledgeError("file_not_found")
    if path.stat().st_size > MAX_FILE_BYTES:
        raise KnowledgeError("file_too_large")

    text = extract_text(path).strip()
    if not text:
        raise KnowledgeError("empty_text")
    chunks = chunk_text(text)
    if not chunks:
        raise KnowledgeError("empty_text")

    store = _memory_store(profile_dir)
    tag = f"{SOURCE_TAG_PREFIX}{safe}"
    stored = 0
    try:
        for chunk in chunks:
            content = f"[fonte: {safe}] {chunk}"
            try:
                store.add_fact(content, category=KNOWLEDGE_CATEGORY, tags=tag)
                stored += 1
            except Exception:
                _log.exception("add_fact failed for %s (chunk skipped)", safe)
    finally:
        close = getattr(store, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                pass

    manifest = _load_manifest(profile_dir)
    manifest["files"][safe] = {
        "size": path.stat().st_size,
        "facts": stored,
        "ingested_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    _save_manifest(profile_dir, manifest)
    return {"name": safe, "facts": stored, "chunks": len(chunks)}


def remove_document(profile_dir: Path, filename: str) -> Dict[str, Any]:
    """Delete a document's facts (by src: tag), its file and manifest entry."""
    profile_dir = Path(profile_dir)
    safe = sanitize_filename(filename)
    tag = f"{SOURCE_TAG_PREFIX}{safe}"

    removed = 0
    store = _memory_store(profile_dir)
    try:
        rows: List[Dict[str, Any]] = []
        try:
            rows = store.list_facts(category=KNOWLEDGE_CATEGORY, limit=100000) or []
        except TypeError:
            # Older list_facts signatures without limit.
            rows = store.list_facts(category=KNOWLEDGE_CATEGORY) or []
        except Exception:
            _log.exception("list_facts failed while removing %s", safe)
        for row in rows:
            row_tags = str((row or {}).get("tags") or "")
            if tag in [t.strip() for t in row_tags.split(",")]:
                fact_id = (row or {}).get("fact_id") or (row or {}).get("id")
                if fact_id is None:
                    continue
                try:
                    store.remove_fact(int(fact_id))
                    removed += 1
                except Exception:
                    _log.exception("remove_fact %s failed", fact_id)
    finally:
        close = getattr(store, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                pass

    path = knowledge_dir(profile_dir) / safe
    try:
        if path.exists():
            path.unlink()
    except OSError:
        _log.exception("could not delete knowledge file %s", path)

    manifest = _load_manifest(profile_dir)
    manifest["files"].pop(safe, None)
    _save_manifest(profile_dir, manifest)
    return {"name": safe, "facts_removed": removed}


def ensure_holographic_provider(profile_dir: Path) -> Dict[str, Any]:
    """Make sure the profile loads the holographic provider next session.

    Sets ``memory.provider: holographic`` in the profile's config.yaml when no
    external provider is configured. NEVER overwrites a different provider
    (mem0 etc. — the engine allows only one external provider at a time); in
    that case the KB facts are still stored, but retrieval will only work if
    that provider is holographic — the caller surfaces this as a warning.
    """
    import yaml

    config_path = Path(profile_dir) / "config.yaml"
    cfg: Dict[str, Any] = {}
    if config_path.exists():
        try:
            loaded = yaml.safe_load(config_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                cfg = loaded
        except Exception:
            _log.exception("unreadable config.yaml at %s", config_path)
            return {"ok": False, "provider": None, "changed": False}

    memory_cfg = cfg.get("memory")
    if not isinstance(memory_cfg, dict):
        memory_cfg = {}
        cfg["memory"] = memory_cfg
    current = str(memory_cfg.get("provider") or "").strip()
    if current and current != "holographic":
        return {"ok": True, "provider": current, "changed": False,
                "warning": "other_provider_active"}
    if current == "holographic":
        return {"ok": True, "provider": current, "changed": False}

    memory_cfg["provider"] = "holographic"
    try:
        config_path.write_text(
            yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )
    except OSError:
        _log.exception("could not write config.yaml at %s", config_path)
        return {"ok": False, "provider": None, "changed": False}
    return {"ok": True, "provider": "holographic", "changed": True}
