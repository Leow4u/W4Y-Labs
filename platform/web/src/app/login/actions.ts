"use server";

import { redirect } from "next/navigation";
import { setDevSession } from "@/lib/dev-auth";
import { isEmailAllowed } from "@/lib/allowlist";

// Porta Work4You: valida a allowlist, grava a sessão da plataforma e leva ao
// SSO (/login/enter) que autentica no Wayne e cai direto no /chat. `next`
// interno (ex.: /admin, /instancias) tem prioridade — rotas de operação não
// precisam da sessão do Wayne.
export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") || "").trim();
  if (!email) redirect("/login?error=empty");
  if (!isEmailAllowed(email)) redirect("/login?error=denied");

  await setDevSession(email);

  const next = String(formData.get("next") || "").trim();
  if (next === "/admin" || next === "/instancias") redirect(next);
  redirect("/login/enter");
}
