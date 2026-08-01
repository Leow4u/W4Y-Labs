"""Per-agent monthly credit cap (Governança "teto").

The cap lives in the PROFILE's config.yaml under ``limits.monthly_credits``
(int, credits; 1 credit = US$ 0.01 — the product's display convention).
Spend is computed from the profile's own state.db, the same SUM the
analytics endpoint uses (actual cost when present, estimated otherwise),
windowed to the CURRENT CALENDAR MONTH.

Enforcement points (all call ``check_budget``):
  - gateway ``prompt.submit`` (interactive turns, incl. per-agent sessions)
  - cron ``run_job`` (scheduled turns)
  - kanban ``_default_spawn`` (board workers)
A missing/zero cap means UNLIMITED — the product default.
"""
from __future__ import annotations

import datetime as _dt
import logging
import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional

_log = logging.getLogger("wayne.budget")

USD_PER_CREDIT = 0.01


def month_start_epoch(now: Optional[_dt.datetime] = None) -> float:
    now = now or _dt.datetime.now()
    return _dt.datetime(now.year, now.month, 1).timestamp()


def get_cap_credits(profile_home: Path) -> Optional[int]:
    """The profile's monthly cap in credits, or None when unlimited."""
    config_path = Path(profile_home) / "config.yaml"
    if not config_path.exists():
        return None
    try:
        import yaml

        cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        limits = cfg.get("limits") if isinstance(cfg, dict) else None
        raw = limits.get("monthly_credits") if isinstance(limits, dict) else None
        cap = int(raw) if raw is not None else None
        return cap if cap and cap > 0 else None
    except Exception:
        _log.exception("unreadable limits in %s", config_path)
        return None


def month_spend_credits(profile_home: Path) -> float:
    """Credits spent this calendar month (actual cost preferred, else estimate)."""
    db_path = Path(profile_home) / "state.db"
    if not db_path.exists():
        return 0.0
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=2)
        try:
            row = conn.execute(
                """
                SELECT COALESCE(SUM(
                    CASE WHEN COALESCE(actual_cost_usd, 0) > 0
                         THEN actual_cost_usd
                         ELSE COALESCE(estimated_cost_usd, 0) END), 0)
                FROM sessions WHERE started_at >= ?
                """,
                (month_start_epoch(),),
            ).fetchone()
            usd = float(row[0] or 0.0)
        finally:
            conn.close()
        return usd / USD_PER_CREDIT
    except Exception:
        # Fail-open on read trouble: a broken meter must never paralyze the
        # agent — the OpenRouter capped key is the hard financial backstop.
        _log.exception("month_spend query failed for %s", db_path)
        return 0.0


def check_budget(profile_home) -> Dict[str, Any]:
    """{allowed, cap_credits, spent_credits}. cap None => always allowed."""
    home = Path(profile_home)
    cap = get_cap_credits(home)
    if cap is None:
        return {"allowed": True, "cap_credits": None, "spent_credits": None}
    spent = month_spend_credits(home)
    return {
        "allowed": spent < cap,
        "cap_credits": cap,
        "spent_credits": round(spent, 1),
    }


def budget_refusal_message(state: Dict[str, Any]) -> str:
    spent = state.get("spent_credits")
    cap = state.get("cap_credits")
    return (
        f"Teto mensal de créditos deste agente atingido "
        f"({spent:.0f} de {cap} cr). Ajuste o teto em Agentes → Governança."
    )
