import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { isVoicePlaybackActive, onVoicePlaybackChange, playSpeechText } from "@/lib/voice-playback";

interface AutoSpeakReply {
  id: string;
  pending: boolean;
  text: string;
}

interface UseAutoSpeakRepliesOptions {
  /** Full voice-conversation loop already speaks its own replies — pause
   *  auto-speak while it runs so clips don't overlap. */
  conversationActive: boolean;
  onError?: (message: string) => void;
  /** Mark the current last reply spoken — shared dedupe with the conversation
   *  consumer, so switching between the two never double-speaks a turn. */
  markSpoken: () => void;
  /** Latest completed assistant reply, or null; `pending` true while streaming.
   *  Must be a NEW function identity whenever the underlying messages change
   *  (e.g. `useCallback(..., [messages])` at the call site) — that identity
   *  change is what re-arms the "speak the newest reply" effect below. */
  pendingReply: () => AutoSpeakReply | null;
  /** Re-arm on session switch so opening a chat never reads its existing last reply. */
  sessionKey: string | number;
}

/**
 * Pure-TTS auto-speak: when on, read each completed assistant turn aloud — no
 * dictation, no conversation loop. Ported from the desktop's
 * use-auto-speak-replies.ts, same behavior; the on/off preference persists to
 * `config.yaml`'s `voice.auto_tts` (the exact key the desktop reads/writes —
 * `PUT /api/config` deep-merges, so a bare `{voice:{auto_tts}}` patch is safe).
 */
export function useAutoSpeakReplies({
  conversationActive,
  onError,
  markSpoken,
  pendingReply,
  sessionKey,
}: UseAutoSpeakRepliesOptions) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef({ conversationActive, markSpoken, pendingReply });
  latest.current = { conversationActive, markSpoken, pendingReply };

  useEffect(() => {
    let cancelled = false;
    void api
      .getConfig()
      .then((cfg) => {
        if (cancelled) return;
        const voice = (cfg as Record<string, unknown>)?.voice as Record<string, unknown> | undefined;
        setEnabled(voice?.auto_tts === true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      void api.saveConfig({ voice: { auto_tts: next } }).catch(() => {});
      return next;
    });
  }, []);

  // Arm on toggle-on or session switch: consume whatever reply already sits
  // at the bottom so flipping this on (or opening a chat) never blurts out
  // something already visible — only LATER replies get spoken.
  useEffect(() => {
    if (!loaded || !enabled) return;
    latest.current.markSpoken();
  }, [enabled, loaded, sessionKey]);

  // Speak the newest completed reply. Re-runs on two distinct triggers: a new
  // reply arriving (`pendingReply` gets a fresh identity when the caller's
  // messages change) and the previous clip finishing (drains a backlog one at
  // a time via the playback-status subscription).
  useEffect(() => {
    if (!loaded || !enabled) return undefined;

    const speakLatest = () => {
      const { conversationActive, markSpoken, pendingReply } = latest.current;
      if (conversationActive || isVoicePlaybackActive()) return;

      const reply = pendingReply();
      if (!reply || reply.pending) return;

      markSpoken();
      void playSpeechText(reply.text).catch(() => onError?.(t.chat.voiceReadAloudFailed));
    };

    speakLatest();
    const offPlayback = onVoicePlaybackChange(speakLatest);
    return () => offPlayback();
  }, [enabled, loaded, pendingReply, onError, t.chat.voiceReadAloudFailed]);

  return { enabled, toggle };
}
