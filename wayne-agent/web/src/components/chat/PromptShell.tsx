import type { ReactNode } from "react";

/** Shared bordered card the 4 blocking-prompt panels sit in. */
export function PromptShell({
  title,
  tone = "warning",
  children,
}: {
  title: string;
  tone?: "warning" | "error";
  children: ReactNode;
}) {
  const border = tone === "error" ? "border-destructive/40" : "border-warning/40";
  const bg = tone === "error" ? "bg-destructive/5" : "bg-warning/5";
  const text = tone === "error" ? "text-destructive" : "text-warning";

  return (
    <div className={`border ${border} ${bg} p-3 space-y-2`}>
      <div className={`text-xs font-semibold ${text}`}>{title}</div>
      {children}
    </div>
  );
}
