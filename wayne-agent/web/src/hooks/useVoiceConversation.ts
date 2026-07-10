import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { playSpeechText, stopVoicePlayback } from "@/lib/voice-playback";

import { useMicRecorder } from "./useMicRecorder";

export type ConversationStatus = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

interface PendingVoiceResponse {
  id: string;
  pending: boolean;
  text: string;
}

interface VoiceConversationOptions {
  busy: boolean;
  enabled: boolean;
  onFatalError?: () => void;
  onError?: (message: string) => void;
  onSubmit: (text: string) => void;
  onTranscribeAudio: (audio: Blob) => Promise<string>;
  pendingResponse: () => PendingVoiceResponse | null;
  consumePendingResponse: () => void;
}

/**
 * Full-duplex voice conversation loop — listen (VAD-bounded) → transcribe →
 * submit → speak the reply → listen again. Ported from the desktop's
 * voice-conversation mode (apps/desktop/.../use-voice-conversation.ts), same
 * state machine; swaps its assistant-thread nanostore for the `pendingResponse`/
 * `consumePendingResponse` callbacks the caller wires against useChatSession's
 * `messages`, and its toast helpers for a single `onError` callback.
 */
export function useVoiceConversation({
  busy,
  enabled,
  onFatalError,
  onError,
  onSubmit,
  onTranscribeAudio,
  pendingResponse,
  consumePendingResponse,
}: VoiceConversationOptions) {
  const { t } = useI18n();
  const { handle, level } = useMicRecorder(t.chat.voiceMicError);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [muted, setMuted] = useState(false);
  const turnTimeoutRef = useRef<number | null>(null);
  const pendingStartRef = useRef(false);
  const turnClosingRef = useRef(false);
  const awaitingSpokenResponseRef = useRef(false);
  const responseIdRef = useRef<string | null>(null);
  const spokenSourceLengthRef = useRef(0);
  const speechBufferRef = useRef("");
  const enabledRef = useRef(enabled);
  const mutedRef = useRef(muted);
  const busyRef = useRef(busy);
  const statusRef = useRef<ConversationStatus>("idle");
  const wasEnabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearTurnTimeout = () => {
    if (turnTimeoutRef.current) {
      window.clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }
  };

  const resetSpeechBuffer = () => {
    responseIdRef.current = null;
    spokenSourceLengthRef.current = 0;
    speechBufferRef.current = "";
  };

  const appendSpeechText = (text: string) => {
    if (text) speechBufferRef.current = `${speechBufferRef.current}${text}`;
  };

  const takeSpeechChunk = (force = false): string | null => {
    const buffer = speechBufferRef.current.replace(/\s+/g, " ").trim();
    if (!buffer) {
      speechBufferRef.current = "";
      return null;
    }

    const sentence = buffer.match(/^(.+?[.!?。！？])(?:\s+|$)/);
    if (sentence?.[1] && (sentence[1].length >= 8 || force)) {
      const chunk = sentence[1].trim();
      speechBufferRef.current = buffer.slice(sentence[1].length).trim();
      return chunk;
    }

    if (!force && buffer.length > 220) {
      const softBoundary = Math.max(
        buffer.lastIndexOf(", ", 180),
        buffer.lastIndexOf("; ", 180),
        buffer.lastIndexOf(": ", 180),
      );
      if (softBoundary > 80) {
        const chunk = buffer.slice(0, softBoundary + 1).trim();
        speechBufferRef.current = buffer.slice(softBoundary + 1).trim();
        return chunk;
      }
    }

    if (!force) return null;

    speechBufferRef.current = "";
    return buffer;
  };

  const handleTurn = useCallback(
    async (forceTranscribe = false) => {
      if (turnClosingRef.current) return;
      turnClosingRef.current = true;
      clearTurnTimeout();
      setStatus("transcribing");

      try {
        const result = await handle.stop();

        if (!result || (!result.heardSpeech && !forceTranscribe)) {
          if (enabledRef.current && !mutedRef.current && !busyRef.current && statusRef.current !== "speaking") {
            pendingStartRef.current = true;
          }
          setStatus("idle");
          return;
        }

        try {
          const transcript = (await onTranscribeAudio(result.audio)).trim();
          if (!transcript) {
            if (enabledRef.current) pendingStartRef.current = true;
            setStatus("idle");
            return;
          }

          awaitingSpokenResponseRef.current = true;
          resetSpeechBuffer();
          onSubmit(transcript);
          setStatus("thinking");
        } catch {
          onError?.(t.chat.voiceTranscriptionFailed);
          if (enabledRef.current && !mutedRef.current && !busyRef.current) pendingStartRef.current = true;
          setStatus("idle");
        }
      } finally {
        turnClosingRef.current = false;
      }
    },
    [handle, onSubmit, onTranscribeAudio, onError, t.chat.voiceTranscriptionFailed],
  );

  const startListening = useCallback(async () => {
    pendingStartRef.current = false;
    if (!enabledRef.current || mutedRef.current || busyRef.current) return;
    if (statusRef.current !== "idle") return;

    try {
      // VAD tuning mirrors tools.voice_mode defaults (server CLI parity).
      await handle.start({
        silenceLevel: 0.075,
        silenceMs: 1_250,
        idleSilenceMs: 12_000,
        onError: () => {
          onError?.(t.chat.voiceMicError);
          pendingStartRef.current = false;
          onFatalError?.();
        },
        onSilence: () => void handleTurn(),
      });
      setStatus("listening");
      turnTimeoutRef.current = window.setTimeout(() => void handleTurn(), 60_000);
    } catch {
      onError?.(t.chat.voiceMicError);
      pendingStartRef.current = false;
      setStatus("idle");
      onFatalError?.();
    }
  }, [handle, handleTurn, onFatalError, onError, t.chat.voiceMicError]);

  const speak = useCallback(
    async (text: string) => {
      setStatus("speaking");
      try {
        await playSpeechText(text);
      } catch {
        onError?.(t.chat.voicePlaybackFailed);
      } finally {
        if (enabledRef.current) pendingStartRef.current = true;
        setStatus("idle");
      }
    },
    [onError, t.chat.voicePlaybackFailed],
  );

  const start = useCallback(async () => {
    setMuted(false);
    awaitingSpokenResponseRef.current = false;
    resetSpeechBuffer();
    consumePendingResponse();
    pendingStartRef.current = true;
    await startListening();
  }, [consumePendingResponse, startListening]);

  const end = useCallback(async () => {
    pendingStartRef.current = false;
    clearTurnTimeout();
    stopVoicePlayback();
    handle.cancel();
    turnClosingRef.current = false;
    awaitingSpokenResponseRef.current = false;
    resetSpeechBuffer();
    consumePendingResponse();
    setMuted(false);
    setStatus("idle");
  }, [consumePendingResponse, handle]);

  const stopTurn = useCallback(() => {
    if (statusRef.current === "listening") void handleTurn(true);
  }, [handleTurn]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      if (next) {
        clearTurnTimeout();
        handle.cancel();
        setStatus("idle");
      } else if (enabledRef.current && !busyRef.current && statusRef.current === "idle") {
        pendingStartRef.current = true;
      }
      return next;
    });
  }, [handle]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (statusRef.current !== "listening") return;
      event.preventDefault();
      stopTurn();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [enabled, stopTurn]);

  // Drive the loop: after a voice-submitted turn, speak stable chunks as the
  // assistant stream grows. Otherwise start listening when idle between turns.
  useEffect(() => {
    if (!enabled || muted) return;

    if (awaitingSpokenResponseRef.current && status !== "speaking") {
      const response = pendingResponse();

      if (response) {
        if (response.id !== responseIdRef.current) {
          resetSpeechBuffer();
          responseIdRef.current = response.id;
        }
        if (response.text.length > spokenSourceLengthRef.current) {
          appendSpeechText(response.text.slice(spokenSourceLengthRef.current));
          spokenSourceLengthRef.current = response.text.length;
        }

        const chunk = takeSpeechChunk(!response.pending && !busy);
        if (chunk) {
          void speak(chunk);
          return;
        }

        if (!response.pending && !busy) {
          awaitingSpokenResponseRef.current = false;
          consumePendingResponse();
          resetSpeechBuffer();
          pendingStartRef.current = true;
          setStatus("idle");
          return;
        }
      }

      if (!busy && status === "thinking") {
        awaitingSpokenResponseRef.current = false;
        resetSpeechBuffer();
        pendingStartRef.current = true;
        setStatus("idle");
        return;
      }
    }

    if (busy || status !== "idle") return;
    if (pendingStartRef.current) void startListening();
  }, [busy, consumePendingResponse, enabled, muted, pendingResponse, speak, startListening, status]);

  useEffect(() => {
    if (enabled && !wasEnabledRef.current) void start();
    if (!enabled && wasEnabledRef.current) void end();
    wasEnabledRef.current = enabled;
  }, [enabled, end, start]);

  return { end, level, muted, start, status, stopTurn, toggleMute };
}
