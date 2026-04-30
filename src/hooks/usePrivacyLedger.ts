// Phase 115 — Privacy Ledger.
// 백엔드 ai.rs가 stream_ai_command 4분기마다 emit하는 ai_route_event를 누적해
// "이 세션이 100% on-device인지"를 헤더 배지로 즉시 보여준다.
//
// 누적 데이터는 메모리 전용 — 세션 단위. 재시작 시 초기화 (의도된 동작:
// 사용자가 "이번 세션은 클린한가?"를 빠르게 답하기 위함).

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

export type Backend = "embedded" | "ollama" | "xllm" | "gemini";

export interface AiRouteEvent {
  backend: Backend;
  online: boolean;
  model: string | null;
  prompt_chars: number;
  latency_ms: number;
  ts_ms: number;
}

export interface BackendStats {
  count: number;
  totalPromptChars: number;
  totalLatencyMs: number;
  lastTs: number;
}

export interface LedgerState {
  total: number;
  onlineCalls: number;
  perBackend: Record<Backend, BackendStats>;
  last: AiRouteEvent | null;
}

const EMPTY_STATS: BackendStats = {
  count: 0,
  totalPromptChars: 0,
  totalLatencyMs: 0,
  lastTs: 0,
};

const initialState = (): LedgerState => ({
  total: 0,
  onlineCalls: 0,
  perBackend: {
    embedded: { ...EMPTY_STATS },
    ollama: { ...EMPTY_STATS },
    xllm: { ...EMPTY_STATS },
    gemini: { ...EMPTY_STATS },
  },
  last: null,
});

export function usePrivacyLedger() {
  const [state, setState] = useState<LedgerState>(initialState);

  useEffect(() => {
    const unlisten = listen<AiRouteEvent>("ai_route_event", (e) => {
      const ev = e.payload;
      setState((prev) => {
        const next: LedgerState = {
          total: prev.total + 1,
          onlineCalls: prev.onlineCalls + (ev.online ? 1 : 0),
          perBackend: { ...prev.perBackend },
          last: ev,
        };
        const cur = prev.perBackend[ev.backend] ?? EMPTY_STATS;
        next.perBackend[ev.backend] = {
          count: cur.count + 1,
          totalPromptChars: cur.totalPromptChars + ev.prompt_chars,
          totalLatencyMs: cur.totalLatencyMs + ev.latency_ms,
          lastTs: ev.ts_ms,
        };
        return next;
      });
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const reset = useCallback(() => setState(initialState()), []);

  // 세션이 100% on-device인지 — 호출이 한 번도 없으면 true(아직 검증 안 됨이지만
  // 위험도 0으로 표시), 있으면 onlineCalls === 0 여부.
  const isAllOnDevice = state.onlineCalls === 0;

  return { state, reset, isAllOnDevice };
}
