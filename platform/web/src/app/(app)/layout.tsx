import { redirect } from "next/navigation";
import { getDevSession } from "@/lib/dev-auth";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getDevSession();
  if (!session) redirect("/login");
  return (
    <AppShell email={session.email} isPlatformOperator={session.isPlatformOperator}>
      {children}
    </AppShell>
  );
}
