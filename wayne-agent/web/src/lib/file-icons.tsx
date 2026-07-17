/**
 * file-icons — visual icon per file type, desktop style (Onda 1 of the Files
 * UX). Reuses the "brand favicon" language the chat's file card already uses
 * (FileRefCard): colored square + white glyph for the Office apps (Excel's
 * green X, Word's blue W, PowerPoint's orange P, red PDF, purple IMG, amber
 * ZIP); colored lucide icon for the rest (code, media, text); amber folder.
 * All inline — no external asset.
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

/** Folder color — warm amber (the classic "yellow folder"). */
const FOLDER_COLOR = "#C7912B";

interface FileKind {
  /** Brand glyph (short letter + background). Present = colored square. */
  glyph?: { text: string; bg: string };
  /** Fallback lucide icon (when there is no brand glyph). */
  Icon: LucideIcon;
  /** Lucide icon color (only used when there is no glyph). */
  color: string;
}

/** Classifies a file by extension. `isDirectory` decides before anything else. */
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

  // No brand glyph — colored lucide icon.
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
 * Rendered icon — two sizes: `sm` (list row) and `lg` (grid block). A brand
 * glyph becomes a colored rounded square; the rest is a lucide icon in the
 * type's color.
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
