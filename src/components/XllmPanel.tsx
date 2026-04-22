import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SlidersHorizontal, Loader2, X, RefreshCw, ArrowLeftRight,
  Zap, Database, Cpu, CheckCircle2, GitFork, Sparkles,
} from "lucide-react";

interface AppConfig {
  cache_mode?: string;
  coding_model?: string;
  doc_model?: string;
  pd_threshold_chars?: number;
  max_seq_len?: number;
  xllm_admin_key?: string;
  draft_model?: string;
  speculative_n_draft?: number;
  sparse_attention?: boolean;
  sparse_top_k?: number;
}

interface ModelInfo {
  id: string;
  max_seq_len?: number;
  cache_mode?: string;
  rope_scale?: number;
}

type CacheMode = "Q4" | "Q8" | "FP16";

const CACHE_MODES: { value: CacheMode; label: string; desc: string }[] = [
  {
    value: "Q4",
    label: "Q4 — 4-bit",
    desc: "최대 압축. 36GB RAM에서 32K+ 컨텍스트 처리 가능. PD Disaggregation 최적.",
  },
  {
    value: "Q8",
    label: "Q8 — 8-bit",
    desc: "균형. 긴 대화(16K~)에서 속도/품질 타협점. 기본 권장값.",
  },
  {
    value: "FP16",
    label: "FP16 — 16-bit",
    desc: "무압축. 단문 응답, 정밀도 우선. 컨텍스트 짧을 때만 사용.",
  },
];

interface Props {
  onClose: () => void;
}

const XllmPanel: React.FC<Props> = ({ onClose }) => {
  const [config, setConfig] = useState<AppConfig>({});
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [switchTarget, setSwitchTarget] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (switchTimerRef.current) clearTimeout(switchTimerRef.current); };
  }, []);

  useEffect(() => {
    invoke<AppConfig>("load_app_config")
      .then((c) => setConfig(c))
      .catch(() => {});
    refreshModelInfo();
  }, []);

  const refreshModelInfo = useCallback(() => {
    setIsLoadingInfo(true);
    invoke<ModelInfo>("get_xllm_model_info")
      .then(setModelInfo)
      .catch(() => setModelInfo(null))
      .finally(() => setIsLoadingInfo(false));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await invoke("save_xllm_settings", {
        cacheMode: config.cache_mode ?? null,
        codingModel: config.coding_model ?? null,
        docModel: config.doc_model ?? null,
        pdThresholdChars: config.pd_threshold_chars ?? null,
        maxSeqLen: config.max_seq_len ?? null,
        draftModel: config.draft_model ?? null,
        speculativeNDraft: config.speculative_n_draft ?? null,
        sparseAttention: config.sparse_attention ?? null,
        sparseTopK: config.sparse_top_k ?? null,
      });
      setStatusMsg("설정 저장 완료");
    } catch (e) {
      setStatusMsg(`저장 실패: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  const handleSwitch = useCallback(async () => {
    if (!switchTarget.trim()) return;
    setIsSwitching(true);
    setStatusMsg(null);
    try {
      const msg = await invoke<string>("switch_xllm_model", {
        modelName: switchTarget.trim(),
        cacheMode: config.cache_mode ?? null,
        maxSeqLen: config.max_seq_len ?? null,
      });
      setStatusMsg(msg);
      setSwitchTarget("");
      switchTimerRef.current = setTimeout(refreshModelInfo, 1000);
    } catch (e) {
      setStatusMsg(`전환 실패: ${e}`);
    } finally {
      setIsSwitching(false);
    }
  }, [switchTarget, config, refreshModelInfo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg mx-4 bg-[#0d1117] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 shrink-0">
          <SlidersHorizontal size={13} className="text-accent shrink-0" />
          <span className="text-xs font-semibold">xLLM 실전 최적화 설정</span>
          <button onClick={onClose} className="ml-auto text-white/30 hover:text-white/70 transition-colors">
            <X size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* 현재 모델 상태 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu size={9} /> 현재 로드된 모델
              </label>
              <button
                onClick={refreshModelInfo}
                className="text-white/30 hover:text-white/70 transition-colors"
                title="새로고침"
              >
                {isLoadingInfo
                  ? <Loader2 size={11} className="animate-spin" />
                  : <RefreshCw size={11} />}
              </button>
            </div>
            {modelInfo ? (
              <div className="bg-white/3 border border-white/5 rounded-lg px-3 py-2 font-mono text-[11px] space-y-0.5">
                <div className="text-white/80 truncate">{modelInfo.id}</div>
                <div className="text-white/35 flex gap-4">
                  {modelInfo.max_seq_len && <span>seq_len: {modelInfo.max_seq_len.toLocaleString()}</span>}
                  {modelInfo.cache_mode && <span>cache: {modelInfo.cache_mode}</span>}
                  {modelInfo.rope_scale && <span>rope: ×{modelInfo.rope_scale.toFixed(1)}</span>}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-white/25 italic">xLLM 서버 미연결</p>
            )}
          </section>

          {/* ③ KV Cache Quantization */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Database size={9} /> ③ KV Cache Quantization
            </label>
            <div className="space-y-1.5">
              {CACHE_MODES.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setConfig((c) => ({ ...c, cache_mode: value }))}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    config.cache_mode === value || (!config.cache_mode && value === "Q8")
                      ? "border-accent/40 bg-accent/8"
                      : "border-white/5 bg-white/2 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {(config.cache_mode === value || (!config.cache_mode && value === "Q8")) && (
                      <CheckCircle2 size={11} className="text-accent shrink-0" />
                    )}
                    <span className="text-[11px] font-mono text-white/80">{label}</span>
                  </div>
                  <p className="text-[10px] text-white/35 mt-0.5 ml-[19px]">{desc}</p>
                </button>
              ))}
            </div>
          </section>

          {/* ① PD 임계값 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Zap size={9} /> ① PD Disaggregation 임계값
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="w-32 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                value={config.pd_threshold_chars ?? 8000}
                min={2000}
                max={32000}
                step={1000}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, pd_threshold_chars: parseInt(e.target.value) || 8000 }))
                }
              />
              <span className="text-[11px] text-white/35">
                chars 초과 시 Q4 + temperature 0.3 자동 전환
              </span>
            </div>
          </section>

          {/* ② 모델 역할 분리 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowLeftRight size={9} /> ② 모델 역할 분리 (Elastic Scheduling)
            </label>
            <div className="space-y-2">
              <div className="space-y-1">
                <span className="text-[10px] text-white/30">코딩 모델 (generate_ai_command, git commit)</span>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                  placeholder="Qwen2.5-Coder-7B-Instruct-EXL2-4bpw"
                  value={config.coding_model ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, coding_model: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-white/30">문서화 모델 (analyze_error, 요약)</span>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                  placeholder="gemma-3-4b-it-EXL2-4bpw"
                  value={config.doc_model ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, doc_model: e.target.value }))}
                />
              </div>
            </div>
          </section>

          {/* max_seq_len */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider">
              Max Sequence Length (모델 로드 시 적용)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="w-32 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                value={config.max_seq_len ?? 8192}
                min={2048}
                max={131072}
                step={2048}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, max_seq_len: parseInt(e.target.value) || 8192 }))
                }
              />
              <span className="text-[11px] text-white/35">
                Q4 캐시 + 36GB → 32768 이상도 가능
              </span>
            </div>
          </section>

          {/* ④ SSD 드래프트 모델 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <GitFork size={9} /> ④ SSD — Speculative Decoding 드래프트 모델
            </label>
            <p className="text-[10px] text-white/25 -mt-1">
              소형 드래프트 모델이 비동기로 다음 토큰을 미리 추측 → 1.5~2× 속도 향상 (3080 기준)
            </p>
            <div className="space-y-2">
              <div className="space-y-1">
                <span className="text-[10px] text-white/30">드래프트 모델 디렉토리명</span>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                  placeholder="DeepSeek-Coder-1.3B-Instruct-EXL2"
                  value={config.draft_model ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, draft_model: e.target.value || undefined }))}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/30 shrink-0">드래프트 토큰 수</span>
                <input
                  type="number"
                  className="w-20 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                  value={config.speculative_n_draft ?? 5}
                  min={1}
                  max={16}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, speculative_n_draft: parseInt(e.target.value) || 5 }))
                  }
                />
                <span className="text-[11px] text-white/25">
                  높을수록 빠르지만 적중률 의존 (권장 4–8)
                </span>
              </div>
            </div>
          </section>

          {/* ⑤ Dynamic Sparse Attention */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={9} /> ⑤ Dynamic Sparse Attention
            </label>
            <p className="text-[10px] text-white/25 -mt-1">
              긴 컨텍스트에서 중요 토큰만 선택 집중 → VRAM 10GB에서 128K+ 컨텍스트 안정 처리
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/50">활성화</span>
              <button
                onClick={() => setConfig((c) => ({ ...c, sparse_attention: !c.sparse_attention }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  config.sparse_attention ? "bg-accent" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    config.sparse_attention ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {config.sparse_attention && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/30 shrink-0">Top-K 헤드</span>
                <input
                  type="number"
                  className="w-20 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                  value={config.sparse_top_k ?? 64}
                  min={16}
                  max={256}
                  step={16}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, sparse_top_k: parseInt(e.target.value) || 64 }))
                  }
                />
                <span className="text-[11px] text-white/25">
                  낮을수록 메모리 절감, 높을수록 정확도 향상
                </span>
              </div>
            )}
          </section>

          {/* 모델 전환 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider">
              모델 전환 (Fast Role Reversal)
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                placeholder="모델 디렉토리명 입력"
                value={switchTarget}
                onChange={(e) => setSwitchTarget(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSwitch()}
              />
              <button
                onClick={handleSwitch}
                disabled={isSwitching || !switchTarget.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs shrink-0"
              >
                {isSwitching ? <Loader2 size={11} className="animate-spin" /> : <ArrowLeftRight size={11} />}
                전환
              </button>
            </div>
          </section>
        </div>

        {/* 하단 — 상태 메시지 + 저장 버튼 */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-white/5 shrink-0">
          {statusMsg && (
            <span className="text-[11px] text-white/50 truncate flex-1">{statusMsg}</span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs shrink-0"
          >
            {isSaving ? <Loader2 size={11} className="animate-spin" /> : null}
            설정 저장
          </button>
        </div>
      </div>
    </div>
  );
};

export default XllmPanel;
