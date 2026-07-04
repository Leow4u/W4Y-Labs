from pathlib import Path


def test_windows_native_install_path_docs_match_installer() -> None:
    doc = Path("website/docs/user-guide/windows-native.md").read_text()
    install = Path("scripts/install.ps1").read_text()

    assert "%LOCALAPPDATA%\\wayne\\wayne-agent\\venv\\Scripts" in doc
    assert "Get-Command wayne        # should print C:\\Users\\<you>\\AppData\\Local\\wayne\\wayne-agent\\venv\\Scripts\\wayne.exe" in doc
    assert '$wayneBin = "$InstallDir\\venv\\Scripts"' in install
