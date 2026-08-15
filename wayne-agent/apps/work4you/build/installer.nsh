; Materialize the ready engine into %LOCALAPPDATA%\work4you\wayne-agent during
; NSIS install so the first app launch has nothing left to prepare (Cursor-like).
;
; The engine ships as extraResources DIRECTORY -> $INSTDIR\resources\engine.
; It used to ship as engine-runtime.zip and this macro ran Expand-Archive over
; ~12.7k entries mid-install; now NSIS has already written those files natively
; and this is a plain directory copy.
;
; robocopy is used rather than Copy-Item: it is multi-threaded and does not
; choke on the depth of a CPython tree. Exit codes 0-7 are success (1 = files
; copied); 8 and above are real failures.

!macro customInstall
  DetailPrint "Preparing Work4You engine..."
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
