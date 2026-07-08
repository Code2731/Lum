import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parseVoiceError } from "../utils/voiceError";

interface UseVoiceInputOptions {
  enabled?: boolean;
  dedupeMs?: number;
  onTranscript: (text: string) => void;
}

interface UseVoiceInputResult {
  isRecording: boolean;
  voiceBusy: boolean;
  voiceError: string | null;
  voiceStatus: "idle" | "listening" | "processing" | "error";
  handleMicToggle: () => Promise<void>;
  clearVoiceError: () => void;
}

const STOP_FALLBACK_DUP_GUARD_MS = 4_000;

export function useVoiceInput({
  enabled = true,
  dedupeMs = 500,
  onTranscript,
}: UseVoiceInputOptions): UseVoiceInputResult {
  const [isRecording, setIsRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "listening" | "processing" | "error">("idle");
  const mountedRef = useRef(true);
  const voiceBusyRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const isRecordingRef = useRef(false);
  const lastTranscriptRef = useRef<{ text: string; ts: number } | null>(null);
  const awaitingStopEventRef = useRef(false);
  const stopEventReceivedRef = useRef(false);
  const stopFallbackGuardRef = useRef<{ text: string; ts: number } | null>(null);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const emitTranscript = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const now = Date.now();
    const last = lastTranscriptRef.current;
    if (last && last.text === text && now - last.ts < dedupeMs) return;
    lastTranscriptRef.current = { text, ts: now };
    onTranscriptRef.current(text);
  }, [dedupeMs]);

  useEffect(() => {
    if (!enabled) return;

    invoke<boolean>("voice_recording_status")
      .then((on) => {
        if (!mountedRef.current) return;
        setIsRecording(Boolean(on));
        setVoiceStatus(on ? "listening" : "idle");
      })
      .catch(() => {});

    let unlistenTranscript: (() => void) | null = null;
    let unlistenState: (() => void) | null = null;
    let disposed = false;

    const transcriptPromise = listen<string>("voice_transcript", (event) => {
      if (!mountedRef.current) return;
      // 이전 세션의 늦은 transcript 이벤트가 새 녹음 세션을 깨지 않도록 차단.
      // 정상 stop 흐름에서는 awaitingStopEvent=true 상태에서만 transcript를 처리한다.
      if (!awaitingStopEventRef.current && isRecordingRef.current) {
        return;
      }
      const payload = (event.payload ?? "").trim();
      const fallbackGuard = stopFallbackGuardRef.current;
      if (fallbackGuard) {
        const age = Date.now() - fallbackGuard.ts;
        if (age >= STOP_FALLBACK_DUP_GUARD_MS) {
          stopFallbackGuardRef.current = null;
        } else if (payload && payload === fallbackGuard.text) {
          // stop 반환값 fallback 뒤 지연 도착한 동일 이벤트는 중복 주입을 막는다.
          stopFallbackGuardRef.current = null;
          if (!mountedRef.current) return;
          setIsRecording(false);
          setVoiceError(null);
          setVoiceStatus("idle");
          return;
        }
      }
      if (awaitingStopEventRef.current) {
        stopEventReceivedRef.current = true;
      }
      emitTranscript(payload);
      setIsRecording(false);
      setVoiceError(null);
      setVoiceStatus("idle");
    })
      .then((off) => {
        if (disposed) {
          off();
          return;
        }
        unlistenTranscript = off;
      })
      .catch(() => {});

    const statePromise = listen<boolean>("voice_recording_state", (event) => {
      const on = Boolean(event.payload);
      if (!mountedRef.current) return;
      setIsRecording(on);
      if (on) setVoiceError(null);
      setVoiceStatus(on ? "listening" : awaitingStopEventRef.current ? "processing" : "idle");
    })
      .then((off) => {
        if (disposed) {
          off();
          return;
        }
        unlistenState = off;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlistenTranscript?.();
      unlistenState?.();
      void transcriptPromise;
      void statePromise;
    };
  }, [enabled, emitTranscript]);

  const handleMicToggle = useCallback(async () => {
    if (!enabled || voiceBusyRef.current) return;
    voiceBusyRef.current = true;
    setVoiceBusy(true);
    try {
      if (isRecording) {
        awaitingStopEventRef.current = true;
        stopEventReceivedRef.current = false;
        setIsRecording(false);
        setVoiceStatus("processing");
        const transcript = await invoke<string>("stop_voice_recording");
        // 백엔드는 성공 시 voice_transcript 이벤트를 emit한다.
        // 이벤트 누락 환경(테스트 목 등)만 반환값으로 보완해 중복 주입을 막는다.
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 30);
        });
        if (!stopEventReceivedRef.current) {
          const text = (transcript ?? "").trim();
          if (text) {
            emitTranscript(text);
            stopFallbackGuardRef.current = { text, ts: Date.now() };
          }
        }
        if (!mountedRef.current) return;
        setVoiceError(null);
        setVoiceStatus("idle");
      } else {
        await invoke("start_voice_recording");
        if (!mountedRef.current) return;
        setIsRecording(true);
        setVoiceError(null);
        setVoiceStatus("listening");
        stopFallbackGuardRef.current = null;
      }
    } catch (e) {
      // IPC/훅 오류 시 프론트 추정 상태(false)로 고정하면
      // 실제 백엔드 녹음 상태와 어긋날 수 있어 재조회로 동기화.
      try {
        const on = await invoke<boolean>("voice_recording_status");
        if (!mountedRef.current) return;
        setIsRecording(Boolean(on));
        setVoiceStatus(on ? "listening" : "idle");
      } catch {
        if (!mountedRef.current) return;
        setIsRecording(false);
        setVoiceStatus("idle");
      }
      if (!mountedRef.current) return;
      setVoiceError(parseVoiceError(e));
      setVoiceStatus("error");
    } finally {
      awaitingStopEventRef.current = false;
      stopEventReceivedRef.current = false;
      voiceBusyRef.current = false;
      if (!mountedRef.current) return;
      setVoiceBusy(false);
    }
  }, [emitTranscript, enabled, isRecording]);

  const clearVoiceError = useCallback(() => {
    setVoiceError(null);
    setVoiceStatus(isRecordingRef.current ? "listening" : "idle");
  }, []);

  return {
    isRecording,
    voiceBusy,
    voiceError,
    voiceStatus,
    handleMicToggle,
    clearVoiceError,
  };
}
