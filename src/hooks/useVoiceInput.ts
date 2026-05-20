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
  handleMicToggle: () => Promise<void>;
}

export function useVoiceInput({
  enabled = true,
  dedupeMs = 500,
  onTranscript,
}: UseVoiceInputOptions): UseVoiceInputResult {
  const [isRecording, setIsRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const lastTranscriptRef = useRef<{ text: string; ts: number } | null>(null);
  const awaitingStopEventRef = useRef(false);
  const stopEventReceivedRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

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
      .then((on) => setIsRecording(Boolean(on)))
      .catch(() => {});

    let unlistenTranscript: (() => void) | null = null;
    let unlistenState: (() => void) | null = null;

    listen<string>("voice_transcript", (event) => {
      if (awaitingStopEventRef.current) {
        stopEventReceivedRef.current = true;
      }
      emitTranscript(event.payload ?? "");
      setIsRecording(false);
      setVoiceError(null);
    })
      .then((off) => {
        unlistenTranscript = off;
      })
      .catch(() => {});

    listen<boolean>("voice_recording_state", (event) => {
      const on = Boolean(event.payload);
      setIsRecording(on);
      if (on) setVoiceError(null);
    })
      .then((off) => {
        unlistenState = off;
      })
      .catch(() => {});

    return () => {
      unlistenTranscript?.();
      unlistenState?.();
    };
  }, [enabled, emitTranscript]);

  const handleMicToggle = useCallback(async () => {
    if (!enabled || voiceBusy) return;
    setVoiceBusy(true);
    try {
      if (isRecording) {
        awaitingStopEventRef.current = true;
        stopEventReceivedRef.current = false;
        setIsRecording(false);
        const transcript = await invoke<string>("stop_voice_recording");
        // 백엔드는 성공 시 voice_transcript 이벤트를 emit한다.
        // 이벤트 누락 환경(테스트 목 등)만 반환값으로 보완해 중복 주입을 막는다.
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 30);
        });
        if (!stopEventReceivedRef.current) {
          emitTranscript(transcript ?? "");
        }
        setVoiceError(null);
      } else {
        await invoke("start_voice_recording");
        setIsRecording(true);
        setVoiceError(null);
      }
    } catch (e) {
      setIsRecording(false);
      setVoiceError(parseVoiceError(e));
    } finally {
      awaitingStopEventRef.current = false;
      stopEventReceivedRef.current = false;
      setVoiceBusy(false);
    }
  }, [emitTranscript, enabled, isRecording, voiceBusy]);

  return {
    isRecording,
    voiceBusy,
    voiceError,
    handleMicToggle,
  };
}
