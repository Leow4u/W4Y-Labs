import { getSiteLocale } from "@/lib/site-locale";
import HelpClient from "./HelpClient";

export const metadata = {
  title: "Central de Ajuda — Work4You",
  description:
    "Tire dúvidas sobre a Work4You: primeiros passos, planos e uso, canais, conectores e conta.",
};

export default async function AjudaPage() {
  const locale = await getSiteLocale();
  return <HelpClient locale={locale} />;
}
