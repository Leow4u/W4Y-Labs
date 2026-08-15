import { redirect } from "next/navigation";

// Download lives on the home page (#install) — keep /baixar as a redirect for old links.
export default function DownloadPage() {
  redirect("/#install");
}
