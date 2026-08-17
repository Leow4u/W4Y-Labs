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

Chave activa gerada a **17/08/2026**. A pública está fixada em
`apps/work4you/scripts/write-engine-trust.cjs`; a privada é o secret
`W4Y_ENGINE_SIGNING_PRIVATE_KEY` no GitHub e um PEM fora do repositório
(`~/.w4y-keys/`). **Perder o PEM sem ter o secret significa rodar a chave**, e
rodar a chave só protege quem instalar uma casca posterior à rotação.

Até essa data isto era só maquinaria: ninguém definia
`W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64`, portanto todas as cascas publicadas tinham
`engineUpdatePublicKeyB64: null`; o workflow escrevia o `latest.json` sem
`sha256` nem `signature`; e o `verifyEngineManifest` **retorna logo** quando
esses dois campos faltam. Resultado: o motor era instalado sem verificação
nenhuma, enquanto este documento dizia que a protecção era "HTTPS + assinatura
do manifesto".

### Publicar

O workflow `desktop-win.yml` assina sozinho e **recusa publicar** sem o secret.
Pelo caminho manual:

```powershell
$env:W4Y_ENGINE_SIGNING_PRIVATE_KEY = Get-Content ~/.w4y-keys/engine-signing-20260817.pem -Raw
pwsh platform/wayne-fly/build-engine-zip.ps1
node scripts/sign-engine-manifest.mjs --zip platform/wayne-fly/wayne-engine-YYYYMMDD.zip --manifest platform/wayne-fly/latest.json
```

### A ordem não pode ser trocada

Uma casca que não tenha a chave e receba um manifesto **assinado** não o ignora
— o `verifyEngineManifest` lança `"Engine update is signed but ... is not
configured"`. Ou seja, publicar um feed assinado tira a actualização do motor a
toda a gente que esteja numa casca anterior à 1.0.118. Recuperam ao actualizar a
casca (esse caminho é independente e continua a funcionar), mas veem um erro
pelo meio.

Portanto: **primeiro sai a casca com a chave, só depois o feed passa a ser
assinado.** Vale para qualquer rotação futura.

### Rodar a chave

1. Gerar o par novo, guardar o PEM fora do repositório.
2. `gh secret set W4Y_ENGINE_SIGNING_PRIVATE_KEY` com o PEM novo.
3. Trocar a constante em `write-engine-trust.cjs` — é um diff visível de propósito.
4. Publicar a casca **antes** do primeiro feed assinado com a chave nova.

Verificador: `apps/work4you/electron/w4y-wayne-resolve.cjs` →
`verifyEngineManifest()`. Guardas: `electron/engine-trust-key.test.cjs` (a casca
confia em alguém) e `electron/engine-manifest-signature.test.cjs` (o assinador e
o verificador continuam a falar a mesma língua).

Dev bypass (local only): `W4Y_SKIP_ENGINE_VERIFY=1`.

## GCS bucket (recommended)

- `latest.json`, `.exe`, `.zip`: `Cache-Control: no-store`
- Prefer **private bucket** + signed URLs for engine ZIP when desktop auth is wired
- Until then: HTTPS + manifest signature — real desde 17/08/2026, ver acima

## Platform session

Production Cloud Run / web deploy requires:

```
W4Y_SESSION_SECRET=<random 32+ bytes, base64 or raw string>
ALLOW_ALL_EMAILS=1   # public launch, or comma ALLOWED_EMAILS for closed beta
```

Signed cookie name: `w4y_session` (HS256 via jose).
