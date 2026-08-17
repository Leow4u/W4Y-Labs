; First-install seed of the motor into %LOCALAPPDATA%\work4you\wayne-agent.
;
; Casca fina (17/08/2026): the NSIS no longer embeds resources\engine. When the
; tree is absent this macro is a no-op and the app downloads the motor from
; gs://w4y-engine-dist/ on first launch (ensureWayneEngineForPackaged).
;
; Legacy fat installers still ship resources\engine; in that case we robocopy
; into LOCALAPPDATA (and skip when a ready runtime is already there).
;
; robocopy exit codes 0-7 are success; 8+ are failures.

!macro customInstall
  DetailPrint "Preparing Work4You engine (if bundled)..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "\
    $$ErrorActionPreference=\"Stop\";\
    $$src=Join-Path \"$INSTDIR\" \"resources\\engine\";\
    if (-not (Test-Path -LiteralPath $$src)) { exit 0 };\
    $$root=Join-Path $$env:LOCALAPPDATA \"work4you\";\
    $$dest=Join-Path $$root \"wayne-agent\";\
    New-Item -ItemType Directory -Force -Path $$root | Out-Null;\
    if (Test-Path -LiteralPath $$dest) {\
      $$ready=Join-Path $$dest \"runtime-ready.json\";\
      $$py=Join-Path $$dest \".venv\\Scripts\\python.exe\";\
      if ((Test-Path -LiteralPath $$ready) -and (Test-Path -LiteralPath $$py)) { exit 0 };\
      Remove-Item -Recurse -Force -LiteralPath $$dest -ErrorAction SilentlyContinue;\
    };\
    robocopy $$src $$dest /E /MT:16 /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null;\
    if ($$LASTEXITCODE -ge 8) { throw (\"engine copy failed: robocopy \" + $$LASTEXITCODE) };\
    $$cfg=Join-Path $$dest \".venv\\pyvenv.cfg\";\
    $$pyHome=Join-Path $$dest \"runtime\\python\";\
    if ((Test-Path -LiteralPath $$cfg) -and (Test-Path -LiteralPath $$pyHome)) {\
      $$text=[IO.File]::ReadAllText($$cfg);\
      if ($$text -match \"(?m)^home\\s*=\") { $$text=[regex]::Replace($$text,\"(?m)^home\\s*=.*$$\",\"home = $$pyHome\") }\
      else { $$text=\"home = $$pyHome`n\" + $$text };\
      $$utf8=New-Object System.Text.UTF8Encoding $$false;\
      [IO.File]::WriteAllText($$cfg, $$text, $$utf8);\
    };\
    exit 0;\
  "'
  Pop $0
  DetailPrint "Engine prepare exit code: $0"
!macroend
