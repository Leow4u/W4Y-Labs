"""Tests for the one-time ~/.wayne → ~/.work4you data migration."""

import os
from pathlib import Path

import pytest

from work4you_cli import home_migration as hm


@pytest.fixture
def roots(tmp_path, monkeypatch):
    old = tmp_path / "wayne"
    new = tmp_path / "work4you"
    monkeypatch.setattr(hm, "_legacy_default_home", lambda: old)
    monkeypatch.setattr(hm, "_new_default_home", lambda: new)
    monkeypatch.delenv("WAYNE_HOME", raising=False)
    monkeypatch.delenv("WORK4YOU_HOME", raising=False)
    monkeypatch.delenv("WORK4YOU_SKIP_HOME_MIGRATION", raising=False)
    # Container detection must not interfere with tmp roots.
    import work4you_constants

    monkeypatch.setattr(work4you_constants, "is_container", lambda: False)
    return old, new


def _seed_legacy(old: Path) -> None:
    old.mkdir(parents=True)
    (old / "config.yaml").write_text(
        f"skills_dir: {old / 'skills'}\n", encoding="utf-8"
    )
    (old / ".env").write_text("OPENROUTER_API_KEY=sk-x\n", encoding="utf-8")
    (old / "skills").mkdir()
    (old / "skills" / "SKILL.md").write_text("x", encoding="utf-8")
    (old / "cron").mkdir()
    (old / "cron" / "jobs.json").write_text(
        f'{{"workdir": "{(old / "scripts").as_posix()}"}}', encoding="utf-8"
    )
    # Code entries that must NOT move.
    (old / "wayne-agent").mkdir()
    (old / "wayne-agent" / "code.py").write_text("pass", encoding="utf-8")
    (old / "engine-source.json").write_text("{}", encoding="utf-8")


class TestMaybeMigrateHome:
    def test_moves_data_keeps_code_and_stamps_markers(self, roots):
        old, new = roots
        _seed_legacy(old)

        assert hm.maybe_migrate_home() is True

        assert (new / "config.yaml").is_file()
        assert (new / "skills" / "SKILL.md").is_file()
        assert (new / "cron" / "jobs.json").is_file()
        # Code stays behind.
        assert (old / "wayne-agent" / "code.py").is_file()
        assert (old / "engine-source.json").is_file()
        assert not (new / "wayne-agent").exists()
        # Markers.
        assert (new / hm._MIGRATED_MARKER).is_file()
        assert (old / hm._MOVED_STUB).is_file()

    def test_rewrites_old_root_prefixes_in_known_files(self, roots):
        old, new = roots
        _seed_legacy(old)

        hm.maybe_migrate_home()

        cfg = (new / "config.yaml").read_text(encoding="utf-8")
        jobs = (new / "cron" / "jobs.json").read_text(encoding="utf-8")
        assert str(old) not in cfg and old.as_posix() not in cfg
        assert str(old) not in jobs and old.as_posix() not in jobs
        assert str(new) in cfg or new.as_posix() in cfg

    def test_second_run_is_noop(self, roots):
        old, new = roots
        _seed_legacy(old)
        assert hm.maybe_migrate_home() is True
        assert hm.maybe_migrate_home() is False

    def test_resumes_leftovers_when_marker_present(self, roots):
        old, new = roots
        _seed_legacy(old)
        assert hm.maybe_migrate_home() is True
        # Simulate an entry that failed to move on the first pass.
        (old / hm._MOVED_STUB).unlink()
        (old / "memories").mkdir()
        (old / "memories" / "MEMORY.md").write_text("m", encoding="utf-8")

        assert hm.maybe_migrate_home() is True
        assert (new / "memories" / "MEMORY.md").is_file()

    def test_skips_when_explicit_home_env_set(self, roots, monkeypatch):
        old, new = roots
        _seed_legacy(old)
        monkeypatch.setenv("WAYNE_HOME", str(old))
        assert hm.maybe_migrate_home() is False
        assert (old / "config.yaml").is_file()

    def test_skips_when_work4you_home_env_set(self, roots, monkeypatch):
        old, new = roots
        _seed_legacy(old)
        monkeypatch.setenv("WORK4YOU_HOME", str(new))
        assert hm.maybe_migrate_home() is False

    def test_skip_env_flag(self, roots, monkeypatch):
        old, new = roots
        _seed_legacy(old)
        monkeypatch.setenv("WORK4YOU_SKIP_HOME_MIGRATION", "1")
        assert hm.maybe_migrate_home() is False

    def test_refuses_when_both_roots_have_unmarked_data(self, roots):
        old, new = roots
        _seed_legacy(old)
        new.mkdir()
        (new / "config.yaml").write_text("other: 1\n", encoding="utf-8")

        assert hm.maybe_migrate_home() is False
        # Nothing moved, nothing clobbered.
        assert (old / "config.yaml").is_file()
        assert (new / "config.yaml").read_text(encoding="utf-8") == "other: 1\n"

    def test_noop_without_legacy_root(self, roots):
        old, new = roots
        assert hm.maybe_migrate_home() is False
        assert not new.exists()

    def test_lock_contention_skips(self, roots):
        old, new = roots
        _seed_legacy(old)
        (old / hm._LOCK_NAME).write_text("", encoding="utf-8")
        assert hm.maybe_migrate_home() is False
        assert (old / "config.yaml").is_file()

    def test_code_only_legacy_root_does_not_relaunch(self, roots):
        old, new = roots
        old.mkdir(parents=True)
        (old / "wayne-agent").mkdir()
        (old / "engine-source.json").write_text("{}", encoding="utf-8")

        assert hm.maybe_migrate_home() is False
        assert not (new / hm._MIGRATED_MARKER).exists()


class TestPlatformDefaultDynamicResolution:
    def test_prefers_new_root_when_present(self, tmp_path, monkeypatch):
        import work4you_constants

        monkeypatch.delenv("WAYNE_HOME", raising=False)
        monkeypatch.delenv("WORK4YOU_HOME", raising=False)
        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        if os.name == "nt":
            monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
            new, legacy = tmp_path / "work4you", tmp_path / "wayne"
        else:
            new, legacy = tmp_path / ".work4you", tmp_path / ".wayne"

        legacy.mkdir()
        assert work4you_constants._get_platform_default_wayne_home() == legacy

        new.mkdir()
        assert work4you_constants._get_platform_default_wayne_home() == new
