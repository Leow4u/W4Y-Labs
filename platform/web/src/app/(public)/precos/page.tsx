import { redirect } from "next/navigation";

// A página de preços agora é a /planos (SuperGrok-style: pública, com checkout
// embedded in-app). /precos vira um atalho — mantém o link "Preços" da landing
// e URLs antigas funcionando.
export default function PrecosPage() {
  redirect("/planos");
}
