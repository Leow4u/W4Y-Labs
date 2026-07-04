"""Tests for ``wayne_cli.diagnostics_upload`` — disabled in the W4Y fork.

Upstream this module uploaded gzipped debug bundles to Nous-internal S3 via
signed URLs minted by portal.nousresearch.com.  The W4Y fork must never ship
tenant data to remote storage, so every entry point now raises instead of
performing network I/O — and the module carries no network plumbing at all.
"""

import inspect

import pytest


class TestRemoteUploadDisabled:
    def test_request_upload_url_raises(self):
        from wayne_cli.diagnostics_upload import request_upload_url

        with pytest.raises(RuntimeError, match="disabled in the W4Y fork"):
            request_upload_url(content_type="application/gzip", size_bytes=512)

    def test_put_bundle_raises(self):
        from wayne_cli.diagnostics_upload import put_bundle

        with pytest.raises(RuntimeError, match="disabled in the W4Y fork"):
            put_bundle("https://bucket.s3.amazonaws.com/x?sig", b"data")

    def test_share_to_nous_raises(self):
        from wayne_cli.diagnostics_upload import share_to_nous

        with pytest.raises(RuntimeError, match="disabled in the W4Y fork"):
            share_to_nous(b"\x1f\x8bgzipped-bundle")

    def test_module_has_no_network_machinery(self):
        """The urllib plumbing must be gone — no code path can open a socket."""
        import wayne_cli.diagnostics_upload as mod

        source = inspect.getsource(mod)
        assert "urllib" not in source
        assert "urlopen" not in source
        assert not hasattr(mod, "NAS_BASE"), (
            "the Nous account service base URL must not survive in the fork"
        )
