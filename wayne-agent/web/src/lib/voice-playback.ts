/**
 * Voice playback singleton — plays synthesized speech (data URL from
 * POST /api/audio/speak) via a plain <audio> element. Ported from the
 * desktop's voice-conversation mode (apps/desktop/src/lib/voice-playback.ts);
 * swaps its nanostores `$voicePlayback` for a tiny local pub-sub (no new
 * dependency — this module is the only thing that needs to broadcast status)
 * and its `speakText` RPC for our `api.speakText` REST call — same endpoint,
 * same shape, no local hardware involved (cloud-safe).
 */
import { api } from "@/lib/api";
import { sanitizeTextForSpeech } from "@/lib/speech-text";

// Free Edge TTS occasionally hands back audio that never fires
// `playing`/`ended` nor `error` — leaving the loop stuck "speaking" forever.
// Reject if playback stalls this long (rearmed on every progress tick, so
// legitimately long speech is never cut off).
const PLAYBACK_STALL_MS = 15_000;

export type VoicePlaybackStatus = "idle" | "preparing" | "speaking";

let status: VoicePlaybackStatus = "idle";
let currentAudio: HTMLAudioElement | null = null;
let currentStop: (() => void) | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function setStatus(next: VoicePlaybackStatus) {
  status = next;
  for (const fn of listeners) fn();
}

/** Subscribe to playback status changes (idle ↔ preparing ↔ speaking). */
export function onVoicePlaybackChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isVoicePlaybackActive(): boolean {
  return status !== "idle";
}

export function stopVoicePlayback() {
  sequence += 1;
  currentStop?.();
  currentStop = null;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio.load();
    currentAudio = null;
  }

  setStatus("idle");
}

export async function playSpeechText(text: string): Promise<boolean> {
  stopVoicePlayback();

  const speakableText = sanitizeTextForSpeech(text);
  if (!speakableText) return false;

  const ownSequence = sequence;
  const isCurrent = () => ownSequence === sequence;

  setStatus("preparing");

  try {
    const response = await api.speakText(speakableText);
    if (!isCurrent()) return false;

    const audio = new Audio(response.data_url);
    currentAudio = audio;
    setStatus("speaking");

    await new Promise<void>((resolve, reject) => {
      let stall: number | null = null;

      const cleanup = () => {
        if (stall !== null) {
          window.clearTimeout(stall);
          stall = null;
        }
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        audio.removeEventListener("timeupdate", armStall);
        currentStop = null;
      };

      const armStall = () => {
        if (stall !== null) window.clearTimeout(stall);
        stall = window.setTimeout(() => {
          cleanup();
          reject(new Error("Playback stalled"));
        }, PLAYBACK_STALL_MS);
      };

      const onEnded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Playback failed"));
      };

      currentStop = () => {
        cleanup();
        resolve();
      };

      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.addEventListener("timeupdate", armStall);
      armStall();
      void audio.play().catch(onError);
    });

    if (!isCurrent()) return false;

    currentAudio = null;
    setStatus("idle");
    return true;
  } catch (error) {
    if (isCurrent()) {
      currentStop = null;
      currentAudio = null;
      setStatus("idle");
    }
    throw error;
  }
}
