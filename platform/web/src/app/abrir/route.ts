import { redirect } from "next/navigation";
import { getDevSession } from "@/lib/dev-auth";
import { postLoginDestination } from "@/lib/shared-motor";

export const dynamic = "force-dynamic";

// GET /abrir — signed-in users: SSO to browser app, or download handoff in L0.
export async function GET() {
  const session = await getDevSession();
  if (!session) redirect("/login");

  redirect(postLoginDestination());
}
