/**
 * file-curation — separa o que é ARQUIVO DO USUÁRIO do que é RUÍDO DO SISTEMA
 * na tela de Arquivos (Onda 1). A raiz de `/api/files` é o HOME persistente do
 * tenant (`/opt/data`), então mistura projetos e uploads com infra do runtime
 * (`.venv`, `.state.db-litestream`, `bin`, `cache`…). O usuário-final vê só o
 * conteúdo dele; a infra vai pra uma seção "Sistema" recolhida (ou aparece
 * inteira sob `?full=1`, a visão interna).
 *
 * Regra conservadora — só esconde o que é reconhecidamente de sistema:
 *   1. Qualquer coisa que começa com "." (dotfiles/dotfolders).
 *   2. Nomes de infra conhecidos (venvs, caches, node_modules, backups…).
 *   3. Arquivos de banco/replicação (*.db, *.db-litestream, *.sock, *.pid).
 */
import type { ManagedFileEntry } from "@/lib/api";

// Subdirs de runtime do WAYNE_HOME (lista canônica do backend). O usuário NÃO
// mexe nisso — vai pra seção "Sistema". Mantidos VISÍVEIS os outputs do
// usuário: projects, uploads, documents, images, videos, audio, scripts,
// screenshots (e as pastas próprias dele) + arquivos soltos.
const SYSTEM_NAMES = new Set<string>([
  // orquestração / estado do agente
  "cron", "hooks", "logs", "lsp", "memories", "pairing", "plans", "platforms",
  "plugins", "profiles", "sandboxes", "sessions", "skills", "skins",
  "spawn-trees", "spawn_trees", "workspace", "kanban", "home",
  // caches
  "image_cache", "audio_cache", "video_cache", "document_cache",
  "browser_screenshots", "lazy-packages", "lazy_packages",
  // runtime / instalação (venvs, toolchains, unix-home)
  "bin", "cache", "backups", "node_modules", "node", "go", "__pycache__",
  "tmp", "temp", "lib", "lib64", "share", "include", "wayne", "wayne-agent",
  "lost+found",
]);

// Arquivos soltos de configuração/estado (não são documentos do usuário).
const SYSTEM_FILES = new Set<string>([
  "config.yaml", "auth.json", "channel_directory.json", "gateway_state.json",
  "requirements.txt", "pyvenv.cfg",
  // Persona/memória do agente (editados via módulo Agentes, não como arquivo).
  "SOUL.md", "USER.md", "MEMORY.md",
]);

const SYSTEM_SUFFIXES = [
  ".db", ".db-shm", ".db-wal", ".db-litestream", ".sock", ".pid", ".lock",
];

/** É entrada de sistema (a esconder do usuário-final)? */
export function isSystemEntry(entry: ManagedFileEntry): boolean {
  const name = entry.name;
  if (name.startsWith(".")) return true; // dotfiles/dotfolders
  if (entry.is_directory) {
    if (SYSTEM_NAMES.has(name)) return true;
    if (name.startsWith(".venv") || name.startsWith("venv")) return true;
    return false;
  }
  // Arquivos:
  if (SYSTEM_FILES.has(name)) return true;
  if (/cache\.json$/i.test(name)) return true; // *_cache.json, *-cache.json (caches de modelos)
  if (/^config\.yaml(\.|$)/.test(name)) return true; // config.yaml.bak, .bak2, .bak-<ts>
  if (/\.bak\d*$/.test(name) || /\.bak-/.test(name)) return true;
  if (SYSTEM_SUFFIXES.some((s) => name.endsWith(s))) return true;
  return false;
}

/** Divide a listagem em conteúdo do usuário e ruído do sistema. */
export function partitionEntries(entries: ManagedFileEntry[]): {
  user: ManagedFileEntry[];
  system: ManagedFileEntry[];
} {
  const user: ManagedFileEntry[] = [];
  const system: ManagedFileEntry[] = [];
  for (const e of entries) (isSystemEntry(e) ? system : user).push(e);
  return { user, system };
}

/** Ordena: pastas antes de arquivos, cada grupo alfabético (padrão desktop). */
export function sortEntries(entries: ManagedFileEntry[]): ManagedFileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}
