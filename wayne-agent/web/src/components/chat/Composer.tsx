import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUp,
  AudioLines,
  ClipboardPaste,
  FileUp,
  ImageIcon,
  Link2,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";

import { ChatModelBar } from "@/components/ChatModelBar";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { useAutoSpeakReplies } from "@/hooks/useAutoSpeakReplies";
import { useVoiceConversation } from "@/hooks/useVoiceConversation";

export interface ComposerAttachment {
  name: string;
  kind: "image" | "file";
  /** Miniatura REAL da imagem no chip (Onda 4, paridade desktop) — object URL
   *  local ou data URL; sem ela o chip cai no ícone. */
  previewUrl?: string;
}

interface CompletionItem {
  text: string;
  display?: string;
  meta?: string;
}

/** Token sob o cursor (última "palavra" até um espaço/nova linha). */
function tokenAtCursor(value: string, cursor: number): { token: string; start: number } {
  let start = cursor;
  while (start > 0 && !/\s/.test(value[start - 1])) start--;
  return { token: value.slice(start, cursor), start };
}

/**
 * Composer "nu" — o miolo do cartão de mensagem (textarea + toolbar), no
 * desenho do benchmark E do "+" do DESKTOP (menu ATTACH: Imagens…, Arquivos…,
 * Colar imagem, URL…). Colar uma imagem direto no campo também anexa.
 *
 * Durante o turno: Enter entra na FILA (a próxima mensagem, enviada quando o
 * turno acabar — o comportamento esperado). STEER (orientar o turno em
 * andamento sem interromper, session.steer) fica num botão explícito ao lado.
 * O botão principal vira ■ parar.
 */
export function Composer({
  disabled,
  busy,
  onSend,
  onQueue,
  onSteer,
  onSlashSubmit,
  onCompleteSlash,
  onCompletePath,
  onTranscribe,
  onInterrupt,
  onAttach,
  onAttachPath,
  onRemoveAttachment,
  attachments = [],
  attaching = false,
  focusKey = 0,
  placeholder,
  lastReply = null,
  sessionKey = "",
  modePicker,
}: {
  /** Trava tudo (prompt bloqueante aberto). */
  disabled?: boolean;
  /** Turno rodando — Enter enfileira; botão vira ■ parar. */
  busy?: boolean;
  onSend: (text: string) => void;
  /** Enfileirar a próxima mensagem (enviada ao fim do turno). */
  onQueue?: (text: string) => void;
  /** Orientar sem interromper (session.steer) — botão explícito quando busy. */
  onSteer?: (text: string) => void;
  /** Executar um /comando (slash.exec) em vez de mandar como prompt. */
  onSlashSubmit?: (command: string) => void;
  /** Autocomplete: / (complete.slash) e @ (complete.path). */
  onCompleteSlash?: (text: string) => Promise<CompletionItem[]>;
  onCompletePath?: (word: string) => Promise<CompletionItem[]>;
  /** Ditado: grava áudio → transcreve (retorna o texto). Ausente = sem mic. */
  onTranscribe?: (dataUrl: string, mimeType: string) => Promise<string>;
  onInterrupt?: () => void;
  /** Anexar (imagens e/ou arquivos — o chamador roteia por tipo). */
  onAttach?: (files: File[]) => void;
  /** Colar um caminho de arquivo do WORKSPACE → anexa (Onda 4). */
  onAttachPath?: (path: string) => void;
  /** Remover um anexo da fila do próximo prompt (por índice). */
  onRemoveAttachment?: (index: number) => void;
  /** Anexos já na fila do próximo prompt. */
  attachments?: ComposerAttachment[];
  /** Upload/attach em andamento — spinner no botão "+". */
  attaching?: boolean;
  /** Incremente para devolver o foco ao campo (ex.: fim do turno). */
  focusKey?: number;
  /** Placeholder custom (ex.: "Inicie uma tarefa neste projeto"). */
  placeholder?: string;
  /** Última resposta do assistente (para o modo de voz falar e o auto-fala
   *  ler) — id/texto/streaming, computado pelo pai a partir de `messages`. */
  lastReply?: { id: string; text: string; pending: boolean } | null;
  /** Identifica a conversa atual (rearma o auto-fala ao trocar de sessão). */
  sessionKey?: string | number;
  /** Chip de MODO de permissões (slot — a página injeta o ModePicker). */
  modePicker?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  useMenuDismiss(menuOpen, () => { setMenuOpen(false); setUrlMode(false); }, "attach");
  const [urlValue, setUrlValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Autocomplete (/ e @) ──────────────────────────────────────────────
  const [comp, setComp] = useState<{
    kind: "slash" | "at";
    start: number;
    items: CompletionItem[];
    sel: number;
  } | null>(null);
  const compTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compReq = useRef(0);

  useEffect(() => {
    taRef.current?.focus();
  }, [focusKey]);

  const closeComp = () => setComp(null);

  const refreshCompletions = useCallback(
    (nextValue: string, cursor: number) => {
      const { token, start } = tokenAtCursor(nextValue, cursor);
      const atStart = nextValue.slice(0, start).trim() === "";
      const isSlash = token.startsWith("/") && atStart && !!onCompleteSlash;
      const isAt = token.startsWith("@") && !!onCompletePath;
      if (!isSlash && !isAt) {
        closeComp();
        return;
      }
      const kind: "slash" | "at" = isSlash ? "slash" : "at";
      if (compTimer.current) clearTimeout(compTimer.current);
      const myReq = ++compReq.current;
      compTimer.current = setTimeout(() => {
        const fetcher = isSlash ? onCompleteSlash! : onCompletePath!;
        void fetcher(token).then((items) => {
          if (compReq.current !== myReq) return;
          if (!items.length) {
            closeComp();
            return;
          }
          setComp({ kind, start, items: items.slice(0, 40), sel: 0 });
        });
      }, 130);
    },
    [onCompleteSlash, onCompletePath],
  );

  const acceptCompletion = useCallback(
    (item: CompletionItem) => {
      const ta = taRef.current;
      const cursor = ta?.selectionStart ?? value.length;
      if (!comp) return;
      const before = value.slice(0, comp.start);
      const after = value.slice(cursor);
      // Ref que termina em ":" (ex.: @file:) segue completando o caminho;
      // senão fecha e adiciona um espaço.
      const openEnded = item.text.endsWith(":");
      const insert = openEnded ? item.text : `${item.text} `;
      const next = before + insert + after;
      setValue(next);
      const newCursor = before.length + insert.length;
      requestAnimationFrame(() => {
        if (ta) {
          ta.focus();
          ta.setSelectionRange(newCursor, newCursor);
          ta.style.height = "auto";
          ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
        }
      });
      if (openEnded) refreshCompletions(next, newCursor);
      else closeComp();
    },
    [comp, value, refreshCompletions],
  );

  const clearField = () => {
    setValue("");
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  };

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    // /comando → slash.exec (não vira prompt). Só fora de um turno em andamento.
    if (!busy && trimmed.startsWith("/") && onSlashSubmit) {
      onSlashSubmit(trimmed);
      clearField();
      return;
    }
    if (busy) {
      // Turno rodando → enfileira a próxima mensagem (enviada ao fim).
      if (!onQueue) return;
      onQueue(trimmed);
    } else {
      onSend(trimmed);
    }
    clearField();
  }, [value, disabled, busy, onSend, onQueue, onSlashSubmit]);

  const doSteer = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || !onSteer) return;
    onSteer(trimmed);
    clearField();
  }, [value, onSteer]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Drawer de autocomplete aberto: setas navegam, Enter/Tab aceitam, Esc fecha.
    if (comp && comp.items.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setComp((c) => (c ? { ...c, sel: (c.sel + 1) % c.items.length } : c));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setComp((c) =>
          c ? { ...c, sel: (c.sel - 1 + c.items.length) % c.items.length } : c,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptCompletion(comp.items[comp.sel]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeComp();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    setValue(el.value);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    refreshCompletions(el.value, el.selectionStart ?? el.value.length);
  };

  // Colar imagem direto no campo (print do desktop: "Paste image").
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length && onAttach) {
      e.preventDefault();
      onAttach(files);
      return;
    }
    // Colar um CAMINHO de arquivo do workspace → vira anexo (Onda 4, paridade
    // desktop): uma linha só, absoluto, extensão conhecida. Texto comum passa.
    if (onAttachPath) {
      const text = e.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (
        text &&
        !text.includes("\n") &&
        /^\/[^\s][^\n]*\.(png|jpe?g|gif|webp|svg|bmp|pdf|xlsx?|csv|docx?|pptx?|md|txt|json|zip|mp3|mp4|wav|html?)$/i.test(
          text,
        )
      ) {
        e.preventDefault();
        onAttachPath(text);
      }
    }
  };

  const pasteFromClipboard = useCallback(async () => {
    setMenuOpen(false);
    if (!onAttach) return;
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((tp) => tp.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(
          new File([blob], `clipboard-${Date.now()}.${type.split("/")[1] || "png"}`, {
            type,
          }),
        );
      }
      if (files.length) onAttach(files);
    } catch {
      /* permissão negada / clipboard vazio — silencioso */
    }
  }, [onAttach]);

  // ── Ditado por voz (MediaRecorder → STT) ──────────────────────────────
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);

  const insertAtCursor = (text: string) => {
    const ta = taRef.current;
    const cursor = ta?.selectionStart ?? value.length;
    const next = value.slice(0, cursor) + text + value.slice(cursor);
    setValue(next);
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        const pos = cursor + text.length;
        ta.setSelectionRange(pos, pos);
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      }
    });
  };

  const toggleRecording = useCallback(async () => {
    if (recording) {
      mediaRecRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!onTranscribe) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error("read"));
          r.readAsDataURL(blob);
        });
        setTranscribing(true);
        try {
          const text = await onTranscribe(dataUrl, mr.mimeType || "audio/webm");
          if (text) insertAtCursor(value ? ` ${text}` : text);
        } catch {
          /* transcrição falhou — silencioso */
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
    } catch {
      /* permissão de microfone negada — silencioso */
    }
  }, [recording, onTranscribe, value]);

  // ── Conversa por voz ao vivo (estilo desktop) ──────────────────────────
  // Modo "live": ouvir → transcrever → enviar → falar a resposta → ouvir de
  // novo. Reaproveita o MESMO onTranscribe (dictation) e o endpoint REST de
  // TTS que o desktop usa (POST /api/audio/speak) — nenhum hardware local
  // envolvido, funciona igual num tenant remoto (Fly.io) ou local.
  const { toast, showToast } = useToast();
  const lastSpokenIdRef = useRef<string | null>(null);
  const showVoiceError = useCallback(
    (message: string) => {
      if (message) showToast(message, "error");
    },
    [showToast],
  );

  const markLastReplySpoken = useCallback(() => {
    if (lastReply) lastSpokenIdRef.current = lastReply.id;
  }, [lastReply]);

  const pendingReplyForVoice = useCallback(() => {
    if (!lastReply || lastReply.id === lastSpokenIdRef.current) return null;
    return lastReply;
  }, [lastReply]);

  const [voiceConversationActive, setVoiceConversationActive] = useState(false);

  const conversation = useVoiceConversation({
    busy: !!busy,
    enabled: voiceConversationActive,
    onFatalError: () => setVoiceConversationActive(false),
    onError: showVoiceError,
    onSubmit: onSend,
    onTranscribeAudio: async (audio) => {
      if (!onTranscribe) return "";
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(audio);
      });
      return onTranscribe(dataUrl, audio.type || "audio/webm");
    },
    pendingResponse: pendingReplyForVoice,
    consumePendingResponse: markLastReplySpoken,
  });

  const autoSpeak = useAutoSpeakReplies({
    conversationActive: voiceConversationActive,
    onError: showVoiceError,
    markSpoken: markLastReplySpoken,
    pendingReply: pendingReplyForVoice,
    sessionKey,
  });

  const startConversation = useCallback(() => setVoiceConversationActive(true), []);
  const endConversation = useCallback(() => {
    setVoiceConversationActive(false);
    void conversation.end();
  }, [conversation]);

  const submitUrl = useCallback(() => {
    const url = urlValue.trim();
    setUrlMode(false);
    setUrlValue("");
    setMenuOpen(false);
    if (!url) return;
    // URL entra no texto do prompt — o agente navega/baixa com as ferramentas.
    setValue((v) => (v ? `${v}\n${url}` : url));
    taRef.current?.focus();
  }, [urlValue]);

  const menuItemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted";

  return (
    <div className="relative flex flex-col">
      {/* Drawer de autocomplete (/comandos e @refs) — abre pra cima. */}
      {comp && comp.items.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeComp} aria-hidden />
          <div
            role="listbox"
            className="absolute bottom-full left-3 z-50 mb-2 max-h-64 w-[min(28rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl"
          >
            {comp.items.map((it, i) => (
              <button
                key={`${it.text}-${i}`}
                type="button"
                role="option"
                aria-selected={i === comp.sel}
                onMouseEnter={() => setComp((c) => (c ? { ...c, sel: i } : c))}
                onClick={() => acceptCompletion(it)}
                className={`flex w-full items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                  i === comp.sel ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60"
                }`}
              >
                <span className="shrink-0 font-medium">{it.display ?? it.text}</span>
                {it.meta && (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {it.meta}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {attachments.map((a, i) => (
            <span
              key={`${a.name}-${i}`}
              className={`group inline-flex max-w-[220px] items-center gap-1.5 border border-border bg-muted/40 text-xs text-foreground ${
                a.previewUrl
                  ? "rounded-xl py-1 pl-1 pr-1.5"
                  : "rounded-full py-1 pl-2.5 pr-1.5"
              }`}
              title={a.name}
            >
              {a.previewUrl ? (
                // Miniatura REAL (Onda 4, paridade desktop AttachmentPill).
                <img
                  src={a.previewUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
                />
              ) : a.kind === "image" ? (
                <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <FileUp className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 truncate">{a.name}</span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(i)}
                  aria-label={t.common.close}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        rows={1}
        value={value}
        placeholder={
          busy ? t.chat.queuePlaceholder : placeholder ?? t.chat.composerPlaceholder
        }
        disabled={disabled}
        onChange={autoGrow}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
      />

      <div className="relative flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAttach?.(Array.from(e.target.files));
            e.target.value = "";
            setMenuOpen(false);
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAttach?.(Array.from(e.target.files));
            e.target.value = "";
            setMenuOpen(false);
          }}
        />

        <button
          type="button"
          disabled={!onAttach || attaching || disabled}
          onClick={() => setMenuOpen((o) => !o)}
          title={t.chat.attachImage}
          aria-label={t.chat.attachImage}
          aria-expanded={menuOpen}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {attaching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-45" : ""}`} />
          )}
        </button>

        {modePicker}

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setMenuOpen(false);
                setUrlMode(false);
              }}
              aria-hidden
            />
            <div
              data-menu-root="attach"
              role="menu"
              className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t.chat.attachTitle}
              </div>
              <button
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-4 w-4 shrink-0 opacity-80" />
                {t.chat.attachFiles}
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4 shrink-0 opacity-80" />
                {t.chat.attachImages}
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => void pasteFromClipboard()}
              >
                <ClipboardPaste className="h-4 w-4 shrink-0 opacity-80" />
                {t.chat.pasteImage}
              </button>
              {urlMode ? (
                <input
                  autoFocus
                  value={urlValue}
                  placeholder="https://…"
                  onChange={(e) => setUrlValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitUrl();
                    if (e.key === "Escape") {
                      setUrlMode(false);
                      setUrlValue("");
                    }
                  }}
                  className="m-1 w-[calc(100%-8px)] rounded-lg border border-live/50 bg-background px-2.5 py-1.5 text-sm text-foreground outline-none"
                />
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemCls}
                  onClick={() => setUrlMode(true)}
                >
                  <Link2 className="h-4 w-4 shrink-0 opacity-80" />
                  {t.chat.attachUrl}
                </button>
              )}
            </div>
          </>
        )}

        {/* Empurra modelo + mic + enviar pra DIREITA (layout Grok). */}
        <div className="min-w-0 flex-1" />

        {voiceConversationActive ? (
          <ConversationPill conversation={conversation} disabled={!!disabled} onEnd={endConversation} t={t} />
        ) : (
          <>
            {/* Seletor de modelo (pill Grok, sem "modelo"/raio). */}
            <ChatModelBar light />

            {/* Ditado por voz — AO LADO do modelo (mic → transcrição → campo). */}
            {onTranscribe && (
              <button
                type="button"
                onClick={() => void toggleRecording()}
                disabled={disabled || transcribing}
                title={recording ? t.chat.stopRecording : t.chat.dictate}
                aria-label={recording ? t.chat.stopRecording : t.chat.dictate}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  recording
                    ? "animate-pulse bg-destructive/10 text-destructive"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {transcribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : recording ? (
                  <Square className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            )}

            {/* Falar respostas em voz alta (TTS puro, sem ouvir) — só faz
                sentido junto do pipeline de voz (onTranscribe presente). */}
            {onTranscribe && (
              <button
                type="button"
                onClick={autoSpeak.toggle}
                disabled={disabled}
                title={autoSpeak.enabled ? t.chat.stopSpeakingReplies : t.chat.speakReplies}
                aria-label={autoSpeak.enabled ? t.chat.stopSpeakingReplies : t.chat.speakReplies}
                aria-pressed={autoSpeak.enabled}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  autoSpeak.enabled
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {autoSpeak.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            )}

            {!busy && !value.trim() && onTranscribe ? (
              <button
                type="button"
                onClick={startConversation}
                disabled={disabled}
                title={t.chat.startVoice}
                aria-label={t.chat.startVoice}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95"
              >
                <AudioLines className="h-4 w-4" />
              </button>
            ) : busy ? (
              <>
                {/* Orientar o turno em andamento sem interromper (session.steer) —
                    aparece quando há texto; Enter enfileira, este botão orienta. */}
                {onSteer && value.trim() && (
                  <button
                    type="button"
                    onClick={doSteer}
                    title={t.chat.steerNow}
                    aria-label={t.chat.steerNow}
                    className="grid h-9 shrink-0 place-items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {t.chat.steerNow}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onInterrupt}
                  aria-label={t.chat.stop}
                  title={t.chat.stop}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95"
                >
                  <span className="h-3 w-3 rounded-[3px] bg-background" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={disabled || !value.trim()}
                aria-label={t.chat.promptSubmit}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-all hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-25"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}

/** Pílula da conversa por voz ativa — substitui modelo/mic/enviar enquanto
 *  roda (igual ao desktop): mic mudo/ativo, "Parar" (só ao ouvir), "Encerrar"
 *  com barras de nível reagindo ao volume captado / girando enquanto fala. */
function ConversationPill({
  conversation,
  disabled,
  onEnd,
  t,
}: {
  conversation: ReturnType<typeof useVoiceConversation>;
  disabled: boolean;
  onEnd: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { level, muted, status, stopTurn, toggleMute } = conversation;
  const speaking = status === "speaking";
  const listening = status === "listening" && !muted;

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={toggleMute}
        disabled={disabled}
        title={muted ? t.chat.unmuteMic : t.chat.muteMic}
        aria-label={muted ? t.chat.unmuteMic : t.chat.muteMic}
        aria-pressed={muted}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          muted ? "bg-muted text-muted-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>

      {listening && (
        <button
          type="button"
          onClick={stopTurn}
          disabled={disabled}
          title={t.chat.voiceStopTurn}
          aria-label={t.chat.voiceStopTurn}
          className="grid h-9 shrink-0 place-items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Square className="h-3 w-3 fill-current" />
          {t.chat.voiceStopTurn}
        </button>
      )}

      <button
        type="button"
        onClick={onEnd}
        disabled={disabled}
        title={t.chat.endConversation}
        aria-label={t.chat.endConversation}
        className="grid h-9 shrink-0 grid-flow-col place-items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
      >
        {speaking ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <VoiceLevelBars level={level} active={listening} />
        )}
        {t.chat.endConversation}
      </button>
      <span className="sr-only" role="status">
        {muted ? t.chat.voiceMuted : listening ? t.chat.voiceListening : t.chat.thinking}
      </span>
    </div>
  );
}

function VoiceLevelBars({ level, active }: { level: number; active: boolean }) {
  const bars = [0.55, 0.85, 1, 0.85, 0.55];
  const normalized = Math.max(0, Math.min(level, 1));

  return (
    <span aria-hidden="true" className="flex h-3 items-center gap-0.5">
      {bars.map((weight, index) => {
        const height = active ? 0.3 + Math.min(0.7, normalized * weight) : 0.3;
        return (
          <span
            key={index}
            className="w-0.5 rounded-full bg-current"
            style={{ height: `${height * 100}%` }}
          />
        );
      })}
    </span>
  );
}
