/**
 * GlyphSpinner — the ONE-character spinner from the TUI/desktop
 * (unicode-animations), ported (Onda 4): "breathe" for the turn summary,
 * "braille" for dense lines. Replaces the generic spinning Loader2 at the
 * chat's live points — the terminal's signature on the web.
 */
import { useEffect, useState } from "react";

const FRAMES: Record<"breathe" | "braille", string[]> = {
  breathe: ["◜", "◠", "◝", "◞", "◡", "◟"],
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
};

export function GlyphSpinner({
  variant = "breathe",
  className = "",
}: {
  variant?: "breathe" | "braille";
  className?: string;
}) {
  const frames = FRAMES[variant];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), 120);
    return () => clearInterval(id);
  }, [frames.length]);
  return (
    <span
      aria-hidden
      className={`inline-block w-[1em] select-none text-center font-mono leading-none text-live ${className}`}
    >
      {frames[i]}
    </span>
  );
}
