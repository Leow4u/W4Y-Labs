"""Nous-S3 diagnostics upload client — DISABLED in the W4Y fork.

Upstream hermes-agent used this module as the opt-in (``--nous``) destination
for ``wayne debug share``: it minted a short-lived signed URL from the Nous
account service (portal.nousresearch.com) and PUT the gzipped bundle into a
Nous-owned S3 bucket.

The W4Y Labs fork is multi-tenant and must never ship tenant data to remote
storage, so every entry point below now raises instead of performing network
I/O — the ``urllib`` plumbing has been removed entirely.  ``wayne debug
share`` writes its bundle to a local file instead (see ``wayne_cli.debug``).
The function names and signatures are kept so any stale caller fails loudly
with a clear message rather than an ``ImportError``.
"""

_DISABLED_MESSAGE = (
    "remote diagnostics upload is disabled in the W4Y fork; "
    "'wayne debug share' writes the bundle to a local file instead"
)


def request_upload_url(
    content_type: str = "application/gzip",
    size_bytes: int | None = None,
) -> dict:
    """Disabled in the W4Y fork — always raises ``RuntimeError``."""
    raise RuntimeError(_DISABLED_MESSAGE)


def put_bundle(
    upload_url: str,
    data: bytes,
    content_type: str = "application/gzip",
) -> None:
    """Disabled in the W4Y fork — always raises ``RuntimeError``."""
    raise RuntimeError(_DISABLED_MESSAGE)


def share_to_nous(report_bundle: bytes) -> dict:
    """Disabled in the W4Y fork — always raises ``RuntimeError``."""
    raise RuntimeError(_DISABLED_MESSAGE)
