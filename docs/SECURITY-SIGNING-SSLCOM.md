# Assinatura Windows — SSL.com eSigner (Work4You)

> **Importante:** certificados **Code Signing** da SSL.com (OV/EV) **não saem em `.pfx`**
> exportável. A chave privada fica no **eSigner Cloud** ou num token FIPS. O caminho
> correcto é **eSigner CKA** + thumbprint no Windows Certificate Store.

## Estado da tua conta (screenshot)

- Identity **Verified** — OK para emitir certificado
- **Available funds: $0.00** — precisas comprar/depositar antes de emitir
- Próximo clique: **view purchased certificates** (ver se já tens pedido activo)

---

## Passo a passo (primeira vez)

### 1. Comprar certificado Code Signing

1. [secure.ssl.com/account](https://secure.ssl.com/account) → **buy certificate**
2. Escolhe **Code Signing** (OV) ou **EV Code Signing** (SmartScreen imediato; mais caro)
3. Organização: **Work4You** / W4Y Labs (dados alinhados com verificação de identidade)
4. Completa pagamento (deposit funds se necessário)

### 2. Emitir e inscrever no eSigner

1. **view purchased certificates** → abre a ordem
2. Completa validação da organização se ainda pendente
3. Na ordem, secção **SIGNING CREDENTIALS**:
   - **Signing credential enabled** = ON
   - Enroll no **eSigner** (não USB token, a menos que queiras token físico)
4. Guia SSL.com: [Enroll with eSigner](https://www.ssl.com/how-to/esigner-enroll/)

Anota o **Credential ID** (aparece na página da ordem).

### 3. Instalar eSigner CKA (Windows)

1. Download: [eSigner CKA](https://www.ssl.com/esigner/cka/)
2. Instalar e ligar à conta SSL.com (`Leow4u` / leo@work4you.ai)
3. Modo **Manual** (primeiro teste — pede OTP no Authenticator) ou **Automated** (CI, sem OTP por ficheiro)
4. O certificado aparece em `certmgr.msc` → **Personal → Certificates**

### 4. Obter o thumbprint (SHA-1)

```text
Win + R → certmgr.msc
Personal → Certificates → duplo-clique no certificado SSL.com Code Signing
Details → Thumbprint → copiar (sem espaços)
```

Exemplo: `A1B2C3D4E5F6...` (40 caracteres hex)

### 5. Build Work4You assinado

Com CKA a correr e certificado no store:

```powershell
cd C:\DEV\W4Y Labs\wayne-agent\apps\work4you

$env:W4Y_CODE_SIGN_SHA1 = "<thumbprint-sem-espacos>"

npm run dist:win:nsis:signed
```

Ou manualmente:

```powershell
npx electron-builder --win nsis `
  --config.win.certificateSha1=$env:W4Y_CODE_SIGN_SHA1 `
  --config.win.signAndEditExecutable=true
```

### 6. Verificar assinatura

```powershell
Get-AuthenticodeSignature .\release\Work4You-*-win-x64.exe
# Status deve ser Valid
```

Teste manual com SignTool (opcional):

```powershell
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign `
  /fd sha256 /tr http://ts.ssl.com /td sha256 `
  /sha1 $env:W4Y_CODE_SIGN_SHA1 `
  "C:\caminho\para\ficheiro.exe"
```

---

## Quando `.pfx` **não** se aplica

| Cenário | Método |
|---------|--------|
| SSL.com OV/EV Code Signing (2023+) | eSigner CKA + thumbprint |
| Certificado SSL/TLS do site | Não serve para assinar `.exe` |
| Certificado antigo exportável (raro) | `.pfx` + `CSC_LINK` — não é o fluxo SSL.com actual |

Se algum dia tiveres um `.pfx` de **outro** CA:

```powershell
$env:CSC_LINK = "C:\secrets\codesign.pfx"
$env:CSC_KEY_PASSWORD = "..."
npm run dist:win:nsis
```

---

## CI / builds automáticos (depois)

- eSigner CKA em modo **Automated** na máquina de build
- Ou [SSL.com GitHub Action](https://www.ssl.com/guide/esigner-codesigntool-github-action/) + hook `win.sign` custom no electron-builder
- **Nunca** commitar thumbprint + password; usar secrets da CI

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `No certificates were found` | CKA não está a correr; certificado não está em Personal |
| Pede OTP a cada ficheiro | CKA em modo Manual — mudar para Automated ou aceitar OTP no 1.º build |
| `SignTool` não encontrado | Instalar [Windows SDK](https://developer.microsoft.com/windows/downloads/windows-sdk/) |
| SmartScreen "Unknown publisher" | Normal com OV no início; EV ou reputação acumulada |

---

## Referências SSL.com

- [Automate signing with SignTool + eSigner CKA](https://www.ssl.com/how-to/automate-ev-code-signing-with-signtool-or-certutil-esigner/)
- [FAQ EV Code Signing](https://www.ssl.com/faqs/faq-getting-started-with-your-ev-code-signing-certificate/)
- [electron-builder Windows signing](https://www.electron.build/code-signing)
