@echo off
REM ============================================================================
REM Work4You Installer for Windows (CMD wrapper)
REM ============================================================================
REM This batch file launches the PowerShell installer for users running CMD.
REM
REM Usage (from a checkout of the Work4You engine repo):
REM   scripts\install.cmd
REM ============================================================================

echo.
echo  Work4You Installer
echo  Launching PowerShell installer...
echo.

powershell -ExecutionPolicy ByPass -NoProfile -File "%~dp0install.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  Installation failed. Please try running PowerShell directly:
    echo    powershell -ExecutionPolicy ByPass -NoProfile -File "%~dp0install.ps1"
    echo.
    pause
    exit /b 1
)
