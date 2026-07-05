"use client";

import { useState } from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";

// Mensagens PT-BR para os códigos do Firebase Auth que o usuário pode ver.
const ERROS: Record<string, string> = {
  "auth/operation-not-allowed": "Este provedor está em ativação — entre com e-mail e senha.",
  "auth/invalid-credential": "E-mail ou senha incorretos. Se ainda não tem conta, registre-se.",
  "auth/user-not-found": "Conta não encontrada — registre-se abaixo.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/weak-password": "Senha muito curta — use pelo menos 6 caracteres.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/too-many-requests": "Muitas tentativas — aguarde um instante e tente de novo.",
  "auth/email-already-in-use": "Este e-mail já tem conta — entre em vez de registrar.",
  denied: "Acesso ainda não liberado para este e-mail.",
  unverified: "Seu e-mail ainda não foi confirmado — clique no link que enviamos.",
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

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export default function LoginClient({ next }: { next: string }) {
  const [modo, setModo] = useState<"entrar" | "registrar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [podeReenviar, setPodeReenviar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  function limpar() {
    setErro("");
    setAviso("");
    setPodeReenviar(false);
  }

  async function concluir(cred: UserCredential) {
    const idToken = await cred.user.getIdToken();
    const r = await fetch("/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, next }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.next) {
      window.location.href = data.next;
      return;
    }
    if (data.error === "unverified") {
      // mantém o usuário logado no Firebase para permitir o reenvio do link
      setErro(ERROS.unverified);
      setPodeReenviar(true);
      setOcupado(false);
      return;
    }
    await firebaseAuth().signOut().catch(() => {});
    setErro(ERROS[data.error as string] ?? "Não foi possível entrar. Tente novamente.");
    setOcupado(false);
  }

  function falhou(e: unknown) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      setOcupado(false);
      return; // usuário desistiu do popup — sem mensagem de erro
    }
    setErro(ERROS[code] ?? "Não foi possível entrar. Tente novamente.");
    setOcupado(false);
  }

  async function social(provedor: "google" | "microsoft") {
    limpar();
    setOcupado(true);
    const provider =
      provedor === "google" ? new GoogleAuthProvider() : new OAuthProvider("microsoft.com");
    try {
      await concluir(await signInWithPopup(firebaseAuth(), provider));
    } catch (e) {
      falhou(e);
    }
  }

  async function comEmail(ev: React.FormEvent) {
    ev.preventDefault();
    limpar();
    setOcupado(true);
    const auth = firebaseAuth();

    if (modo === "registrar") {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        // Link de confirmação — o usuário volta para /login depois de clicar.
        await sendEmailVerification(cred.user, {
          url: `${window.location.origin}/login`,
        }).catch(() => {});
        await auth.signOut().catch(() => {});
        setModo("entrar");
        setSenha("");
        setAviso(
          "Conta criada! Enviamos um link de confirmação para o seu e-mail — clique nele e depois entre aqui.",
        );
        setOcupado(false);
      } catch (e) {
        falhou(e);
      }
      return;
    }

    try {
      await concluir(await signInWithEmailAndPassword(auth, email, senha));
    } catch (e) {
      falhou(e);
    }
  }

  async function reenviar() {
    const u = firebaseAuth().currentUser;
    if (!u) {
      setErro("Entre com e-mail e senha para reenviarmos o link.");
      setPodeReenviar(false);
      return;
    }
    await sendEmailVerification(u, { url: `${window.location.origin}/login` }).catch(() => {});
    setErro("");
    setAviso("Link reenviado — confira sua caixa de entrada (e o spam).");
    setPodeReenviar(false);
  }

  const botao =
    "flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800";

  return (
    <div className="flex w-full flex-col gap-3">
      <button type="button" className={botao} disabled={ocupado} onClick={() => social("google")}>
        <GoogleIcon /> Continuar com Google
      </button>
      <button type="button" className={botao} disabled={ocupado} onClick={() => social("microsoft")}>
        <MicrosoftIcon /> Continuar com Microsoft
      </button>

      <div className="my-2 flex items-center gap-3 text-xs text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" /> Ou
        <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      </div>

      <form onSubmit={comEmail} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Introduza o seu endereço de e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          type="password"
          required
          placeholder="Senha"
          autoComplete={modo === "registrar" ? "new-password" : "current-password"}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        {aviso && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            {aviso}
          </p>
        )}
        {erro && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {erro}
            {podeReenviar && (
              <button type="button" onClick={reenviar} className="ml-1 underline">
                Reenviar link
              </button>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={ocupado}
          className="font-brand rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {ocupado ? "Aguarde…" : modo === "registrar" ? "Criar conta" : "Continuar"}
        </button>
      </form>

      <p className="text-center text-xs text-neutral-500">
        {modo === "entrar" ? (
          <>
            Não tem conta?{" "}
            <button type="button" onClick={() => { setModo("registrar"); limpar(); }} className="font-medium underline">
              Registre-se
            </button>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <button type="button" onClick={() => { setModo("entrar"); limpar(); }} className="font-medium underline">
              Entrar
            </button>
          </>
        )}
      </p>
    </div>
  );
}
