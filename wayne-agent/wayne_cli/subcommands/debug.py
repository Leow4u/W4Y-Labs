"""``wayne debug`` subcommand parser.

Extracted verbatim from ``wayne_cli/main.py:main()`` (god-file Phase 2).
Handler injected to avoid importing ``main``.
"""

from __future__ import annotations

import argparse
from typing import Callable


def build_debug_parser(subparsers, *, cmd_debug: Callable) -> None:
    """Attach the ``debug`` subcommand to ``subparsers``."""
    # =========================================================================
    # debug command
    # =========================================================================
    debug_parser = subparsers.add_parser(
        "debug",
        help="Debug tools — collect logs and system info for support",
        description="Debug utilities for Wayne Agent. Use 'wayne debug share' to "
        "write a debug report (system info + recent logs) to local files "
        "under ~/.wayne/debug-shares/. Remote upload is disabled in the "
        "W4Y fork — nothing leaves the machine.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
Examples:
    wayne debug share              Write debug report bundle to local files
    wayne debug share --lines 500  Include more log lines
    wayne debug share --local      Print report to stdout (no files written)
    wayne debug share --no-redact  Disable secret redaction
    wayne debug share --nous       Write a single gzipped JSON bundle file
    wayne debug delete <url>       Delete a paste from a pre-fork install
""",
    )
    debug_sub = debug_parser.add_subparsers(dest="debug_command")
    share_parser = debug_sub.add_parser(
        "share",
        help=(
            "Write a debug report bundle to local files (remote upload is "
            "disabled in the W4Y fork)"
        ),
    )
    share_parser.add_argument(
        "--lines",
        type=int,
        default=200,
        help="Number of log lines to include per log file (default: 200)",
    )
    share_parser.add_argument(
        "--local",
        action="store_true",
        help="Print the report to stdout instead of writing bundle files",
    )
    share_parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help=(
            "Accepted for compatibility and ignored — nothing is uploaded "
            "in the W4Y fork, so no confirmation is required."
        ),
    )
    share_parser.add_argument(
        "--no-redact",
        action="store_true",
        help=(
            "Disable secret redaction (default: redact). Logs are normally "
            "run through agent.redact.redact_sensitive_text with force=True "
            "so credentials don't end up in bundle files that may later be "
            "shared by hand."
        ),
    )
    share_parser.add_argument(
        "--nous",
        action="store_true",
        help=(
            "Write the bundle as a single gzipped JSON envelope file. W4Y "
            "fork: the upstream Nous-internal S3 upload is disabled — the "
            "file is only ever written locally. Still force-redacts secrets "
            "unless --no-redact is also passed."
        ),
    )
    delete_parser = debug_sub.add_parser(
        "delete",
        help="Delete a paste uploaded by a pre-fork 'wayne debug share'",
    )
    delete_parser.add_argument(
        "urls",
        nargs="*",
        default=[],
        help="One or more paste URLs to delete (e.g. https://paste.rs/abc123)",
    )
    debug_parser.set_defaults(func=cmd_debug)
