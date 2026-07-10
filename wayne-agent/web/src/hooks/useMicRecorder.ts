import { useEffect, useRef, useState } from "react";

/**
 * Continuous, VAD-bounded mic recorder — ported from the desktop's
 * voice-conversation mode (apps/desktop/.../use-mic-recorder.ts), same
 * MediaRecorder + AnalyserNode approach (100% browser Web Audio API, no
 * native/Electron dependency). The one Electron-only line
 * (`window.hermesDesktop?.requestMicrophoneAccess?.()`) is dropped —
 * on the web, `getUserMedia` itself triggers the browser's native
 * permission prompt.
 */
export interface MicRecorderOptions {
  onLevel?: (level: number) => void;
  onError?: (error: Error) => void;
  onSilence?: () => void;
  silenceLevel?: number;
  silenceMs?: number;
  idleSilenceMs?: number;
}

export interface MicRecording {
  audio: Blob;
  durationMs: number;
  heardSpeech: boolean;
}

interface MicRecorderHandle {
  start: (options?: MicRecorderOptions) => Promise<void>;
  stop: () => Promise<MicRecording | null>;
  cancel: () => void;
}

export function useMicRecorder(genericErrorMessage: string): {
  handle: MicRecorderHandle;
  level: number;
  recording: boolean;
} {
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const heardSpeechRef = useRef(false);
  const silenceTriggeredRef = useRef(false);
  const silenceStartedAtRef = useRef<number | null>(null);
  const stopResolverRef = useRef<((recording: MicRecording | null) => void) | null>(null);

  const cleanup = () => {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setLevel(0);
    setRecording(false);
    silenceTriggeredRef.current = false;
  };

  useEffect(() => () => cleanup(), []);

  const startMeter = (stream: MediaStream, options: MicRecorderOptions) => {
    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      const data = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      audioContextRef.current = audioContext;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centered = value - 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length);
        const normalized = Math.min(1, rms / 42);
        const now = Date.now();

        setLevel(normalized);
        options.onLevel?.(normalized);

        const speechThreshold = options.silenceLevel ?? 0;
        const silenceMs = options.silenceMs ?? 0;
        const idleSilenceMs = options.idleSilenceMs ?? 0;

        if (speechThreshold > 0 && options.onSilence && !silenceTriggeredRef.current) {
          if (normalized >= speechThreshold) {
            heardSpeechRef.current = true;
            silenceStartedAtRef.current = null;
          } else if (heardSpeechRef.current && silenceMs > 0) {
            silenceStartedAtRef.current ??= now;
            if (now - silenceStartedAtRef.current >= silenceMs) {
              silenceTriggeredRef.current = true;
              options.onSilence();
              return;
            }
          } else if (
            !heardSpeechRef.current &&
            idleSilenceMs > 0 &&
            now - startedAtRef.current >= idleSilenceMs
          ) {
            silenceTriggeredRef.current = true;
            options.onSilence();
            return;
          }
        }

        animationRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    } catch {
      setLevel(0);
    }
  };

  const start: MicRecorderHandle["start"] = async (options = {}) => {
    if (recorderRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error(genericErrorMessage);
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      throw new Error(genericErrorMessage);
    }

    const mimeType =
      ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg", "audio/wav"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      ) ?? "";

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(genericErrorMessage);
    }

    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;
    heardSpeechRef.current = false;
    silenceTriggeredRef.current = false;
    silenceStartedAtRef.current = null;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const recordingType = recorder.mimeType || mimeType || "audio/webm";
      const durationMs = Date.now() - startedAtRef.current;
      const heardSpeech = heardSpeechRef.current;

      chunksRef.current = [];
      cleanup();

      const resolver = stopResolverRef.current;
      stopResolverRef.current = null;

      if (!chunks.length) {
        resolver?.(null);
        return;
      }

      resolver?.({ audio: new Blob(chunks, { type: recordingType }), durationMs, heardSpeech });
    };

    recorder.onerror = () => {
      const error = new Error(genericErrorMessage);
      const resolver = stopResolverRef.current;
      stopResolverRef.current = null;
      cleanup();
      options.onError?.(error);
      resolver?.(null);
    };

    recorder.start();
    setRecording(true);
    startMeter(stream, options);
  };

  const stop: MicRecorderHandle["stop"] = () =>
    new Promise<MicRecording | null>((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        cleanup();
        resolve(null);
        return;
      }
      stopResolverRef.current = resolve;
      recorder.stop();
    });

  const cancel: MicRecorderHandle["cancel"] = () => {
    const recorder = recorderRef.current;
    const resolver = stopResolverRef.current;
    stopResolverRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      recorder.stop();
    }

    cleanup();
    resolver?.(null);
  };

  return { handle: { start, stop, cancel }, level, recording };
}
