"use client";

import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";

const ERROS: Record<string, string> = {
  "auth/operation-not-allowed": "Este provedor está em ativação — entre com e-mail e senha.",
  "auth/invalid-credential": "Palavra-passe incorreta.",
  "auth/wrong-password": "Palavra-passe incorreta.",
  "auth/weak-password": "Palavra-passe muito curta — use pelo menos 6 caracteres.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/too-many-requests": "Muitas tentativas — aguarde um instante.",
  "auth/email-already-in-use": "Este e-mail já tem conta — entre com a sua palavra-passe.",
  "auth/network-request-failed": "Sem ligação — verifique a internet e tente de novo.",
  denied: "Acesso ainda não liberado para este e-mail.",
  unverified: "Confirme o seu e-mail — clique no botão que enviámos.",
  captcha: "Confirmação anti-robô falhou — recarregue a página.",
  "email-send-failed": "Não foi possível enviar o email de confirmação. Tente reenviar em instantes.",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
// Turnstile (Cloudflare) — no passo do E-MAIL, protegendo já a entrada.
declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string } }
}

type Etapa = "email" | "senha" | "registrar";

export default function LoginClient({ next, turnstileSitekey }: { next: string; turnstileSitekey?: string }) {
  const [etapa, setEtapa] = useState<Etapa>("email");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [podeReenviar, setPodeReenviar] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const captchaRef = useRef<HTMLDivElement>(null);

  // Renderiza o Turnstile no passo do e-mail (se configurado).
  useEffect(() => {
    if (etapa !== "email" || !turnstileSitekey || !captchaRef.current) return;
    const render = () => {
      if (window.turnstile && captchaRef.current && !captchaRef.current.hasChildNodes()) {
        window.turnstile.render(captchaRef.current, {
          sitekey: turnstileSitekey,
          size: "flexible",
          callback: (t: string) => setCaptcha(t),
          "error-callback": () => setCaptcha(""),
        });
      }
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [etapa, turnstileSitekey]);

  function limpar() { setErro(""); setAviso(""); setPodeReenviar(false); setCodigo(""); }

  async function concluir(cred: UserCredential) {
    try {
      const idToken = await cred.user.getIdToken();
      const r = await fetch("/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken, next, captcha }),
        signal: AbortSignal.timeout(60_000),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.next) {
        window.location.href = data.next;
        return;
      }
      if (data.error === "unverified") {
        setErro(ERROS.unverified);
        setPodeReenviar(true);
        setOcupado(false);
        return;
      }
      await firebaseAuth().signOut().catch(() => {});
      setErro(ERROS[data.error as string] ?? "Não foi possível entrar. Tente novamente.");
      setOcupado(false);
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "TimeoutError";
      await firebaseAuth().signOut().catch(() => {});
      setErro(
        timedOut
          ? "O servidor demorou demais — tente de novo em instantes."
          : "Não foi possível entrar. Tente novamente.",
      );
      setOcupado(false);
    }
  }

  function falhou(e: unknown) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") { setOcupado(false); return; }
    // Corrida: tentou registrar mas a conta já existe → manda para "entrar".
    if (code === "auth/email-already-in-use") { setEtapa("senha"); setErro(ERROS["auth/email-already-in-use"]); setOcupado(false); return; }
    setErro(ERROS[code] ?? "Não foi possível entrar. Tente novamente.");
    setOcupado(false);
  }

  async function social() {
    limpar(); setOcupado(true);
    try { await concluir(await signInWithPopup(firebaseAuth(), new GoogleAuthProvider())); } catch (e) { falhou(e); }
  }

  // Passo 1: e-mail → o servidor diz se a conta existe (com proteção de
  // enumeração), roteando para ENTRAR (existe) ou REGISTRAR (nova).
  async function avancarEmail(ev: React.FormEvent) {
    ev.preventDefault(); limpar(); setOcupado(true);
    try {
      const r = await fetch("/login/exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json().catch(() => ({ exists: null }));
      // exists=false → registrar; true/null → entrar (null é fallback seguro).
      setEtapa(d.exists === false ? "registrar" : "senha");
    } catch {
      setEtapa("senha");
    }
    setOcupado(false);
  }

  async function entrar(ev: React.FormEvent) {
    ev.preventDefault(); limpar(); setOcupado(true);
    try { await concluir(await signInWithEmailAndPassword(firebaseAuth(), email, senha)); }
    catch (e) { falhou(e); }
  }

  async function enviarConfirmacao(idToken: string) {
    const r = await fetch("/login/send-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "email-send-failed");
    }
  }

  async function registrar(ev: React.FormEvent) {
    ev.preventDefault(); limpar(); setOcupado(true);
    const auth = firebaseAuth();
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      const idToken = await cred.user.getIdToken();
      try {
        await enviarConfirmacao(idToken);
      } catch {
        await auth.signOut().catch(() => {});
        setEtapa("senha"); setSenha("");
        setErro(ERROS["email-send-failed"]);
        setPodeReenviar(true);
        setOcupado(false);
        return;
      }
      await auth.signOut().catch(() => {});
      setEtapa("senha"); setSenha("");
      setAviso("Conta criada. Enviamos um email da Work4You com um botao e um codigo de 6 digitos — confirme e depois entre aqui.");
      setPodeReenviar(true);
      setOcupado(false);
    } catch (e) { falhou(e); }
  }

  async function esqueceu() {
    limpar();
    try {
      const r = await fetch("/login/send-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        setErro(ERROS["email-send-failed"]);
        return;
      }
      setAviso("Se existir conta neste email, enviámos um email da Work4You para redefinir a palavra-passe.");
    } catch {
      setErro(ERROS["email-send-failed"]);
    }
  }

  async function reenviar() {
    limpar();
    setOcupado(true);
    try {
      let u = firebaseAuth().currentUser;
      if (!u) {
        if (!email || !senha) {
          setErro("Entre com o email e a palavra-passe para reenviarmos a confirmacao.");
          setPodeReenviar(true);
          setOcupado(false);
          return;
        }
        const cred = await signInWithEmailAndPassword(firebaseAuth(), email, senha);
        u = cred.user;
      }
      const idToken = await u.getIdToken();
      await enviarConfirmacao(idToken);
      await firebaseAuth().signOut().catch(() => {});
      setAviso("Email de confirmacao reenviado — confira a caixa de entrada, o spam e a quarentena. Tambem pode usar o codigo de 6 digitos.");
      setPodeReenviar(true);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      setErro(ERROS[code] ?? ERROS["email-send-failed"]);
      setPodeReenviar(true);
    }
    setOcupado(false);
  }

  async function confirmarCodigo(ev: React.FormEvent) {
    ev.preventDefault();
    setErro("");
    setAviso("");
    setOcupado(true);
    setPodeReenviar(true);
    try {
      const r = await fetch("/login/confirm-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: codigo }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        const err = String(data.error || "");
        setErro(
          err === "expired"
            ? "Codigo expirado — peca um novo email."
            : err === "locked"
              ? "Demasiadas tentativas — aguarde e peca um novo email."
              : "Codigo incorrecto. Verifique o email ou reenvie.",
        );
        setPodeReenviar(true);
        setOcupado(false);
        return;
      }
      setAviso("Email confirmado. Entre com a sua palavra-passe.");
      setCodigo("");
      setEtapa("senha");
      setPodeReenviar(false);
    } catch {
      setErro(ERROS["email-send-failed"]);
      setPodeReenviar(true);
    }
    setOcupado(false);
  }

  const btnSocial =
    "flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-salvia disabled:opacity-50";
  const inputCls =
    "w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-salvia";
  const btnPrim =
    "w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-paper transition-colors hover:bg-black disabled:opacity-50";

  const Mensagens = () => (
    <>
      {aviso && (
        <p className="rounded-lg border border-salvia/50 bg-salvia-soft px-3 py-2 text-xs text-mata">{aviso}</p>
      )}
      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {erro}
          {podeReenviar && <button type="button" onClick={() => void reenviar()} className="ml-1 underline">Reenviar email</button>}
        </div>
      )}
      {podeReenviar && (
        <form onSubmit={(e) => void confirmarCodigo(e)} className="flex flex-col gap-2 rounded-lg border border-line bg-white px-3 py-3">
          <p className="text-xs text-ink-soft">Se o email nao aparecer (spam/quarentena), use o codigo de 6 digitos do email:</p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="Codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm tracking-[0.2em] text-ink outline-none focus:border-salvia"
            />
            <button type="submit" disabled={ocupado || codigo.replace(/\D/g, "").length < 6} className="shrink-0 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-paper disabled:opacity-50">
              Confirmar
            </button>
          </div>
          <button type="button" onClick={() => void reenviar()} className="self-start text-xs font-medium text-mata underline">
            Reenviar email
          </button>
        </form>
      )}
    </>
  );


  // ETAPA 1 — e-mail + Turnstile + provedores sociais
  if (etapa === "email") {
    return (
      <div className="flex w-full flex-col gap-3">
        <button type="button" className={btnSocial} disabled={ocupado} onClick={social}><GoogleIcon /> Continuar com Google</button>
        <div className="my-2 flex items-center gap-3 text-xs text-ink-faint">
          <div className="h-px flex-1 bg-line" /> ou <div className="h-px flex-1 bg-line" />
        </div>
        <form onSubmit={avancarEmail} className="flex flex-col gap-3">
          <input type="email" required autoFocus placeholder="Introduza o seu endereço de e-mail" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          {turnstileSitekey && <div ref={captchaRef} className="w-full min-h-[65px]" />}
          <Mensagens />
          <button type="submit" disabled={ocupado} className={btnPrim}>{ocupado ? "Aguarde…" : "Continuar"}</button>
        </form>
      </div>
    );
  }

  // ETAPA 2 — entrar (conta existe) ou registrar (conta nova)
  const registrando = etapa === "registrar";
  return (
    <form onSubmit={registrando ? registrar : entrar} className="flex w-full flex-col gap-3">
      <div className="rounded-xl border border-line bg-white px-3.5 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="truncate text-ink-soft">{email}</span>
          <button type="button" onClick={() => { setEtapa("email"); limpar(); setSenha(""); }} className="ml-3 shrink-0 text-xs font-medium text-mata hover:underline">Editar</button>
        </div>
      </div>
      {registrando && <p className="text-xs text-ink-soft">Novo por aqui — crie uma palavra-passe para começar.</p>}
      <input type="password" required autoFocus minLength={6} placeholder="Palavra-passe" autoComplete={registrando ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} className={inputCls} />
      {!registrando && (
        <button type="button" onClick={esqueceu} className="-mt-1 self-end text-xs font-medium text-mata hover:underline">Esqueceu a palavra-passe?</button>
      )}
      <Mensagens />
      <button type="submit" disabled={ocupado} className={btnPrim}>{ocupado ? "Aguarde…" : registrando ? "Criar conta" : "Entrar"}</button>
      {!registrando && (
        <p className="text-center text-xs text-ink-soft">
          Não tem conta?{" "}
          <button type="button" onClick={() => { setEtapa("registrar"); limpar(); setSenha(""); }} className="font-medium text-mata underline">Registre-se</button>
        </p>
      )}
    </form>
  );
}
