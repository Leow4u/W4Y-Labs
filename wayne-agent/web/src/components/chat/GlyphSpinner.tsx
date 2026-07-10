/**
 * GlyphSpinner — o spinner de UM caractere do TUI/desktop (unicode-animations),
 * portado (Onda 4): "breathe" pro resumo do turno, "braille" pra linhas densas.
 * Substitui o Loader2 girando genérico nos pontos vivos do chat — a assinatura
 * do terminal na web.
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
