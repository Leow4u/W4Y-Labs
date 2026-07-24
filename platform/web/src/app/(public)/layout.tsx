import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

// Public pages layout (landing + institutional). Committed to the light
// "Papel & Mata" look regardless of OS theme — warm paper ground, warm ink.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <PublicHeader />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
