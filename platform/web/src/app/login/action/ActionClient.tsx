"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";

export default function ActionClient() {
  const params = useSearchParams();
  const mode = params.get("mode") || "";
  const oobCode = params.get("oobCode") || "";
  const [status, setStatus] = useState<"working" | "ok" | "error" | "reset">("working");
  const [msg, setMsg] = useState("A confirmar…");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!oobCode || !mode) {
      setStatus("error");
      setMsg("Link invalido ou incompleto.");
      return;
    }
    if (mode === "verifyEmail") {
      void (async () => {
        try {
          await applyActionCode(firebaseAuth(), oobCode);
          setStatus("ok");
          setMsg("Email confirmado. Ja pode entrar na Work4You.");
        } catch {
          setStatus("error");
          setMsg("Este link expirou ou ja foi usado. Peca um novo em work4you.ai/login.");
        }
      })();
      return;
    }
    if (mode === "resetPassword") {
      void (async () => {
        try {
          const mail = await verifyPasswordResetCode(firebaseAuth(), oobCode);
          setEmail(mail);
          setStatus("reset");
          setMsg("Escolha uma nova palavra-passe.");
        } catch {
          setStatus("error");
          setMsg("Este link de redefinicao expirou ou ja foi usado.");
        }
      })();
      return;
    }
    setStatus("error");
    setMsg("Accao nao suportada.");
  }, [mode, oobCode]);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    try {
      await confirmPasswordReset(firebaseAuth(), oobCode, senha);
      setStatus("ok");
      setMsg("Palavra-passe actualizada. Ja pode entrar.");
    } catch {
      setStatus("error");
      setMsg("Nao foi possivel guardar a nova palavra-passe.");
    }
    setOcupado(false);
  }

  const inputCls =
    "w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-salvia";
  const btnPrim =
    "w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-paper transition-colors hover:bg-black disabled:opacity-50";

  if (status === "reset") {
    return (
      <form onSubmit={(e) => void guardar(e)} className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">{msg}</p>
        {email && (
          <p className="rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink-soft">{email}</p>
        )}
        <input
          type="password"
          required
          minLength={6}
          autoFocus
          placeholder="Nova palavra-passe"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={inputCls}
        />
        <button type="submit" disabled={ocupado} className={btnPrim}>
          {ocupado ? "Aguarde…" : "Guardar palavra-passe"}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p
        className={
          status === "error"
            ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            : status === "ok"
              ? "rounded-lg border border-salvia/50 bg-salvia-soft px-3 py-2 text-sm text-mata"
              : "text-sm text-ink-soft"
        }
      >
        {msg}
      </p>
      {(status === "ok" || status === "error") && (
        <a href="/login" className={btnPrim + " text-center"}>
          Ir para o login
        </a>
      )}
    </div>
  );
}