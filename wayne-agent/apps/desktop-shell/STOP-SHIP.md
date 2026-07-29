# STOP-SHIP — `desktop-shell` (legado)

Feature work on this tree is **frozen permanently** for product direction.

- **Official desktop app:** `apps/desktop` (`com.work4you.app`) 1.x — Electron + React nativo Work4You. **Never publish this shell as Work4You.**
- **Do not** port updater GCS, ZIP/slots, `web_dist`, or UI chips from this tree into the official app.
- **Do not** publish this shell as Work4You. Installs of the old shell (`appId` `com.work4you.desktop`) are a separate legacy product; the new app uses `com.work4you.app`.
- Sangria only if a critical production fire still depends on an old install — otherwise leave untouched.

See `docs/PLATAFORMA.md` (opção A) and `apps/desktop/README.md`.
