# Code signing and engine update integrity

## Windows desktop (SSL.com eSigner)

**SSL.com não exporta `.pfx`** para Code Signing moderno. Usa **eSigner CKA** + thumbprint.

Guia completo: **`docs/SECURITY-SIGNING-SSLCOM.md`**

## macOS desktop (Apple Developer)

Guia completo: **`docs/SECURITY-SIGNING-APPLE.md`** — Organization, Developer ID, notarização, GitHub Actions, GCS.

Resumo:

```powershell
# 1. Instalar eSigner CKA, certificado em certmgr.msc
# 2. Copiar thumbprint (sem espaços)
cd wayne-agent\apps\work4you
.\scripts\dist-win-nsis-signed.ps1 -Thumbprint "SEU_THUMBPRINT_AQUI"
```

Fallback `.pfx` (outro CA, raro):

```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "<pfx-password>"
npm run dist:win:nsis
```

`package.json` → unsigned builds use `signAndEditExecutable: false`. Signed release:

```powershell
npm run dist:win:nsis:signed
```

Timestamp server (SSL.com): passed via `-c.win.rfc3161TimeStampServer=http://ts.ssl.com` in the signed script.

Verify after build:

```powershell
Get-AuthenticodeSignature .\release\Work4You-*-win-x64.exe
```

## Engine ZIP (Ed25519)

### 1. Generate key pair (once, store private key in Secret Manager)

```powershell
node -e "const c=require('crypto');const {publicKey,privateKey}=c.generateKeyPairSync('ed25519');console.log('PRIVATE_PEM\n'+privateKey.export({type:'pkcs8',format:'pem'}));console.log('PUBLIC_B64\n'+publicKey.export({type:'spki',format:'der'}).toString('base64'))"
```

### 2. Publish motor

```powershell
$env:W4Y_ENGINE_SIGNING_PRIVATE_KEY = "<PEM or base64 PKCS8 private>"
pwsh platform/wayne-fly/build-engine-zip.ps1
node scripts/sign-engine-manifest.mjs --zip platform/wayne-fly/wayne-engine-YYYYMMDD.zip --manifest platform/wayne-fly/latest.json
```

### 3. Embed public key in desktop build

Set at **build time** (CI secret or `.env.production.local` never committed):

```
W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64=<SPKI base64 from step 1>
```

Desktop verifier: `apps/work4you/electron/w4y-wayne-resolve.cjs` → `verifyEngineManifest()`.

Dev bypass (local only): `W4Y_SKIP_ENGINE_VERIFY=1`.

## GCS bucket (recommended)

- `latest.json`, `.exe`, `.zip`: `Cache-Control: no-store`
- Prefer **private bucket** + signed URLs for engine ZIP when desktop auth is wired
- Until then: HTTPS + manifest signature

## Platform session

Production Cloud Run / web deploy requires:

```
W4Y_SESSION_SECRET=<random 32+ bytes, base64 or raw string>
ALLOW_ALL_EMAILS=1   # public launch, or comma ALLOWED_EMAILS for closed beta
```

Signed cookie name: `w4y_session` (HS256 via jose).
