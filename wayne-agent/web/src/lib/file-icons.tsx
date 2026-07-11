/**
 * file-icons — ícone visual por tipo de arquivo, estilo desktop (Onda 1 da UX
 * de Arquivos). Reaproveita a linguagem de "favicon de marca" que o cartão de
 * arquivo do chat já usa (FileRefCard): quadrado colorido + glifo branco pros
 * apps de Office (X verde do Excel, W azul do Word, P laranja do PowerPoint,
 * PDF vermelho, IMG roxo, ZIP âmbar); ícone lucide colorido pros demais
 * (código, mídia, texto); pasta âmbar. Tudo inline — nenhum asset externo.
 */
import {
  File as FileIcon,
  FileArchive,
  FileCode,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Music,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** Cor do folder — âmbar quente (a "pasta amarela" clássica). */
const FOLDER_COLOR = "#C7912B";

interface FileKind {
  /** Glifo de marca (letra curta + fundo). Presente = quadrado colorido. */
  glyph?: { text: string; bg: string };
  /** Ícone lucide de fallback (quando não há glifo de marca). */
  Icon: LucideIcon;
  /** Cor do ícone lucide (só usada quando não há glyph). */
  color: string;
}

/** Classifica um arquivo pela extensão. `isDirectory` decide antes de tudo. */
export function classifyFile(name: string, isDirectory: boolean): FileKind {
  if (isDirectory) return { Icon: Folder, color: FOLDER_COLOR };
  const ext = (name.split(".").pop() ?? "").toLowerCase();

  if (["xlsx", "xls", "xlsm", "csv", "ods"].includes(ext))
    return { glyph: { text: "X", bg: "#217346" }, Icon: FileText, color: "#217346" };
  if (ext === "pdf")
    return { glyph: { text: "PDF", bg: "#DC2626" }, Icon: FileText, color: "#DC2626" };
  if (["doc", "docx", "docm", "odt", "rtf"].includes(ext))
    return { glyph: { text: "W", bg: "#2B579A" }, Icon: FileText, color: "#2B579A" };
  if (["ppt", "pptx", "pptm", "odp"].includes(ext))
    return { glyph: { text: "P", bg: "#D24726" }, Icon: FileText, color: "#D24726" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "avif", "ico"].includes(ext))
    return { glyph: { text: "IMG", bg: "#7C3AED" }, Icon: ImageIcon, color: "#7C3AED" };
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2"].includes(ext))
    return { glyph: { text: "ZIP", bg: "#D97706" }, Icon: FileArchive, color: "#D97706" };

  // Sem glifo de marca — ícone lucide colorido.
  if (["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext))
    return { Icon: Film, color: "#DB2777" };
  if (["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext))
    return { Icon: Music, color: "#0891B2" };
  if (
    ["js", "jsx", "ts", "tsx", "py", "json", "html", "htm", "css", "sh", "go", "rs", "java", "rb", "c", "cpp", "yml", "yaml", "toml", "xml"].includes(
      ext,
    )
  )
    return { Icon: FileCode, color: "#2563EB" };
  if (["md", "txt", "log"].includes(ext)) return { Icon: FileText, color: "#6B7280" };

  return { Icon: FileIcon, color: "#6B7280" };
}

/**
 * Ícone renderizado — dois tamanhos: `sm` (linha da lista) e `lg` (bloco da
 * grade). Glifo de marca vira quadrado arredondado colorido; o resto é ícone
 * lucide na cor do tipo.
 */
export function FileTypeIcon({
  name,
  isDirectory,
  size = "sm",
}: {
  name: string;
  isDirectory: boolean;
  size?: "sm" | "lg";
}) {
  const kind = classifyFile(name, isDirectory);
  const lg = size === "lg";

  if (kind.glyph) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-md font-semibold text-white",
          lg ? "h-10 w-10 rounded-lg text-sm" : "h-6 w-6 text-[10px]",
        )}
        style={{ backgroundColor: kind.glyph.bg }}
      >
        {kind.glyph.text}
      </span>
    );
  }

  const Icon = kind.Icon;
  return (
    <Icon
      aria-hidden
      className={cn("shrink-0", lg ? "h-9 w-9" : "h-[18px] w-[18px]")}
      style={{ color: kind.color }}
    />
  );
}
