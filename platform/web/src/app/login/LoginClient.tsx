"use client";

import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
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
  denied: "Acesso ainda não liberado para este e-mail.",
  unverified: "Confirme o seu e-mail — clique no link que enviamos.",
  captcha: "Confirmação anti-robô falhou — recarregue a página.",
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

  function limpar() { setErro(""); setAviso(""); setPodeReenviar(false); }

  async function concluir(cred: UserCredential) {
    const idToken = await cred.user.getIdToken();
    const r = await fetch("/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, next, captcha }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.next) { window.location.href = data.next; return; }
    if (data.error === "unverified") { setErro(ERROS.unverified); setPodeReenviar(true); setOcupado(false); return; }
    await firebaseAuth().signOut().catch(() => {});
    setErro(ERROS[data.error as string] ?? "Não foi possível entrar. Tente novamente.");
    setOcupado(false);
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

  async function registrar(ev: React.FormEvent) {
    ev.preventDefault(); limpar(); setOcupado(true);
    const auth = firebaseAuth();
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      await sendEmailVerification(cred.user, { url: `${window.location.origin}/login` }).catch(() => {});
      await auth.signOut().catch(() => {});
      setEtapa("senha"); setSenha("");
      setAviso("Conta criada! Enviamos um link de confirmação — clique nele e depois entre aqui.");
      setOcupado(false);
    } catch (e) { falhou(e); }
  }

  async function esqueceu() {
    limpar();
    try {
      await sendPasswordResetEmail(firebaseAuth(), email, { url: `${window.location.origin}/login` });
      setAviso("Enviamos um link para redefinir a sua palavra-passe — confira o seu e-mail (e o spam).");
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      setErro(ERROS[code] ?? "Não foi possível enviar o link agora. Tente de novo.");
    }
  }

  async function reenviar() {
    const u = firebaseAuth().currentUser;
    if (!u) { setErro("Entre com e-mail e palavra-passe para reenviarmos o link."); setPodeReenviar(false); return; }
    await sendEmailVerification(u, { url: `${window.location.origin}/login` }).catch(() => {});
    setErro(""); setAviso("Link reenviado — confira a sua caixa de entrada (e o spam)."); setPodeReenviar(false);
  }

  const btnSocial =
    "flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-salvia disabled:opacity-50";
  const inputCls =
    "w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-salvia";
  const btnPrim =
    "w-full rounded-xl bg-mata px-4 py-3 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep disabled:opacity-50";

  const Mensagens = () => (
    <>
      {aviso && (
        <p className="rounded-lg border border-salvia/50 bg-salvia-soft px-3 py-2 text-xs text-mata">{aviso}</p>
      )}
      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {erro}
          {podeReenviar && <button type="button" onClick={reenviar} className="ml-1 underline">Reenviar link</button>}
        </div>
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
