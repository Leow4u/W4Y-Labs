"""PyPI version check — DISABLED in the W4Y fork.

The "wayne-agent" package on PyPI is upstream's code, not this fork's, so the
banner must never compare against it (nor suggest installing it).
"""

from unittest.mock import patch


def test_check_via_pypi_disabled_returns_none():
    """check_via_pypi always reports 'nothing to check' (None) in the fork."""
    from wayne_cli.banner import check_via_pypi
    # Even with a wildly old installed version, no update is ever reported.
    with patch("wayne_cli.banner.VERSION", "0.0.1"):
        assert check_via_pypi() is None


def test_fetch_pypi_latest_disabled_no_network():
    """_fetch_pypi_latest never opens a connection and returns None."""
    import urllib.request

    from wayne_cli.banner import _fetch_pypi_latest

    with patch.object(urllib.request, "urlopen") as mock_urlopen:
        assert _fetch_pypi_latest() is None
    mock_urlopen.assert_not_called()


def test_version_tuple_comparison():
    """Version comparison works with multi-segment versions."""
    from wayne_cli.banner import _version_tuple
    assert _version_tuple("0.13.0") > _version_tuple("0.12.0")
    assert _version_tuple("0.13.0") == _version_tuple("0.13.0")
    assert _version_tuple("1.0.0") > _version_tuple("0.99.99")
