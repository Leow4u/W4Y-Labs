import { redirect } from "next/navigation";
import { getDevSession } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

// GET /abrir — "Abrir o Work4You": mantém o usuário no domínio único. Se já
// existe sessão da plataforma, passa pelo SSO para emitir/renovar os cookies do
// Wayne e cair em /chat; sem sessão, volta para a porta de login.
export async function GET() {
  const session = await getDevSession();
  if (!session) redirect("/login");

  redirect("/login/enter");
}
