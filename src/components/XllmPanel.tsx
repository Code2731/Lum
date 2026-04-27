import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useModelCatalog } from "../hooks/useModelCatalog";
import {
  SlidersHorizontal, Loader2, X, RefreshCw,
  Zap, Cpu, GitFork, Sparkles,
  Download, Play, Square,
} from "lucide-react";

interface AppConfig {
  xllm_base_url?: string;
  cache_mode?: string;
  coding_model?: string;
  doc_model?: string;
  pd_threshold_chars?: number;
  max_seq_len?: number;
  xllm_admin_key?: string;
  draft_model?: string;
  speculative_n_draft?: number;
  // Phase 71
  safety_mode?: string;       // "safe" | "balanced" | "max"
  vram_cap_override?: number; // 0.50 ~ 0.95
  // Phase 72
  vision_enabled?: boolean;
  show_reasoning?: boolean;
  // Phase 78: Dual Engine
  mistral_rs_enabled?: boolean;
  mistral_rs_url?: string;
  mistral_rs_model?: string;
  mistral_rs_isq?: string; // "Q4K" | "Q5K" | "Q6K" | "Q8_0"
  mistral_rs_gguf_file?: string; // GGUF 단일 파일명 — Some이면 mistral.rs를 gguf 서브커맨드로 시작
  mistral_rs_device_layers?: number; // Phase 83: GPU layer 수 수동 override (None이면 mistral.rs auto)
}

const MISTRAL_ISQ_MODES: { value: string; label: string; desc: string }[] = [
  { value: "Q4K", label: "Q4K — 4-bit (기본)", desc: "VRAM 최저, 8B≈5GB. 균형형." },
  { value: "Q5K", label: "Q5K — 5-bit", desc: "품질↑, 8B≈6.5GB." },
  { value: "Q6K", label: "Q6K — 6-bit", desc: "고품질, 8B≈8GB. 10GB VRAM 빡빡." },
  { value: "Q8_0", label: "Q8_0 — 8-bit", desc: "최고품질, 8B≈9GB. 10GB VRAM 한계." },
];

type SafetyMode = "safe" | "balanced" | "max";
const MODE_DEFAULTS: Record<SafetyMode, number> = { safe: 0.70, balanced: 0.80, max: 0.90 };

// Heavy Track 프리셋은 public/models.json의 heavy_presets 배열에서 로드 (useModelCatalog 훅).

interface ModelInfo {
  id: string;
  max_seq_len?: number;
  cache_mode?: string;
  rope_scale?: number;
}

interface Props {
  onClose: () => void;
}

function errMsg(e: unknown): string {
  if (!e) return "알 수 없는 오류";
  if (typeof e === "string") return e;
  const obj = e as Record<string, unknown>;
  return (obj.message as string) ?? JSON.stringify(e);
}

const XllmPanel: React.FC<Props> = ({ onClose }) => {
  const { catalog } = useModelCatalog();
  const [config, setConfig] = useState<AppConfig>({});
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  // mistral.rs 상태
  const [mistralStatus, setMistralStatus] = useState<{ running: boolean; url: string; model: string | null } | null>(null);
  const [isMistralBusy, setIsMistralBusy] = useState<"install" | "start" | "stop" | null>(null);
  const [mistralLog, setMistralLog] = useState<string[]>([]);
  const mistralLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<AppConfig>("load_app_config").then(setConfig).catch(() => {});
    refreshModelInfo();
    checkMistralStatus();
  }, []);

  // mistral.rs 빌드 로그 — cargo stdout/stderr 한 줄씩 실시간 수신
  useEffect(() => {
    const unlisten = listen<string>("mistral_rs_log", (e) => {
      setMistralLog((prev) => {
        // 1000줄 초과 시 앞부분 삭제 (메모리 보호)
        const next = [...prev, e.payload];
        return next.length > 1000 ? next.slice(-800) : next;
      });
      // 다음 tick에 하단 스크롤
      requestAnimationFrame(() => {
        const el = mistralLogRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const refreshModelInfo = useCallback(() => {
    setIsLoadingInfo(true);
    invoke<ModelInfo>("get_xllm_model_info")
      .then(setModelInfo)
      .catch(() => setModelInfo(null))
      .finally(() => setIsLoadingInfo(false));
  }, []);

  const checkMistralStatus = useCallback(() => {
    invoke<{ running: boolean; url: string; model: string | null }>("check_mistral_rs_status")
      .then(setMistralStatus)
      .catch(() => setMistralStatus({ running: false, url: "http://127.0.0.1:8080", model: null }));
  }, []);

  const handleInstallMistral = useCallback(async () => {
    setIsMistralBusy("install");
    setMistralLog([]); // 새 설치 시작 시 이전 로그 클리어
    try {
      const msg = await invoke<string>("install_mistral_rs");
      setStatusMsg(`✅ ${msg}`);
    } catch (e) {
      setStatusMsg(`❌ ${errMsg(e)}`);
    } finally {
      setIsMistralBusy(null);
      checkMistralStatus();
    }
  }, [checkMistralStatus]);

  const handleStartMistral = useCallback(async () => {
    setIsMistralBusy("start");
    try {
      const msg = await invoke<string>("start_mistral_rs");
      setStatusMsg(msg);
      // 시작 폴링 — 30초까지 1초 간격
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts += 1;
        try {
          const s = await invoke<{ running: boolean; url: string; model: string | null }>("check_mistral_rs_status");
          setMistralStatus(s);
          if (s.running || attempts >= 30) clearInterval(poll);
        } catch { if (attempts >= 30) clearInterval(poll); }
      }, 1000);
    } catch (e) {
      setStatusMsg(`❌ ${errMsg(e)}`);
    } finally {
      setIsMistralBusy(null);
    }
  }, []);

  const handleStopMistral = useCallback(async () => {
    setIsMistralBusy("stop");
    try {
      const msg = await invoke<string>("stop_mistral_rs");
      setStatusMsg(`✅ ${msg}`);
    } catch (e) {
      setStatusMsg(`❌ ${errMsg(e)}`);
    } finally {
      setIsMistralBusy(null);
      checkMistralStatus();
    }
  }, [checkMistralStatus]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await invoke("save_xllm_settings", {
        serverUrl: config.xllm_base_url ?? null,
        cacheMode: config.cache_mode ?? null,
        codingModel: config.coding_model ?? null,
        docModel: config.doc_model ?? null,
        pdThresholdChars: config.pd_threshold_chars ?? null,
        maxSeqLen: config.max_seq_len ?? null,
        draftModel: config.draft_model ?? null,
        speculativeNDraft: config.speculative_n_draft ?? null,
        mistralRsEnabled: config.mistral_rs_enabled ?? null,
        mistralRsUrl: config.mistral_rs_url ?? null,
        mistralRsModel: config.mistral_rs_model ?? null,
        mistralRsIsq: config.mistral_rs_isq ?? null,
        mistralRsGgufFile: config.mistral_rs_gguf_file ?? null,
        mistralRsDeviceLayers: config.mistral_rs_device_layers ?? null,
      });
      setStatusMsg("설정 저장 완료");
    } catch (e) {
      setStatusMsg(`저장 실패: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }, [config]);

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

          {/* Phase 85a-3: TabbyAPI UI 섹션 제거됨. 추론 엔진은 mistral.rs 단일.
              아래 mistral.rs Heavy Track 섹션이 메인 시작/중지 UI. */}

          {/* Phase 71: GPU 안전 모드 + VRAM Cap */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Zap size={9} /> GPU VRAM 안전 모드
              <span className="ml-auto text-[9px] text-green-400/70 font-normal normal-case">TabbyAPI autosplit_reserve</span>
            </label>
            <div className="flex gap-1.5">
              {(["safe", "balanced", "max"] as SafetyMode[]).map((m) => {
                const mode = (config.safety_mode as SafetyMode | undefined) ?? "balanced";
                const selected = mode === m;
                const pct = MODE_DEFAULTS[m] * 100;
                return (
                  <button
                    key={m}
                    onClick={async () => {
                      try { await invoke("save_safety_mode", { mode: m }); } catch {}
                      setConfig((c) => ({ ...c, safety_mode: m, vram_cap_override: undefined }));
                    }}
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-[11px] transition-colors ${
                      selected
                        ? "bg-accent/15 border-accent/40 text-white"
                        : "bg-white/3 border-white/5 text-white/55 hover:bg-white/5"
                    }`}
                  >
                    <div className="font-medium">{m === "safe" ? "Safe" : m === "balanced" ? "Balanced" : "Max"}</div>
                    <div className="text-[9px] text-white/40 font-mono mt-0.5">{pct}%</div>
                  </button>
                );
              })}
            </div>

            {/* VRAM Cap 오버라이드 슬라이더 */}
            <div className="bg-white/3 border border-white/5 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40">VRAM Cap 오버라이드</span>
                <span className="font-mono text-white/70">
                  {Math.round(
                    (config.vram_cap_override
                      ?? MODE_DEFAULTS[(config.safety_mode as SafetyMode) ?? "balanced"]
                    ) * 100,
                  )}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={95}
                step={1}
                value={Math.round(
                  (config.vram_cap_override
                    ?? MODE_DEFAULTS[(config.safety_mode as SafetyMode) ?? "balanced"]
                  ) * 100,
                )}
                onChange={async (e) => {
                  const pct = Number(e.target.value);
                  const cap = pct / 100;
                  setConfig((c) => ({ ...c, vram_cap_override: cap }));
                  try { await invoke("save_vram_cap_override", { cap }); } catch {}
                }}
                className="w-full h-1 accent-accent cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-white/25 font-mono">
                <span>50%</span><span>95%</span>
              </div>
              {config.vram_cap_override !== undefined && config.vram_cap_override !== null && (
                <button
                  onClick={async () => {
                    setConfig((c) => ({ ...c, vram_cap_override: undefined }));
                    try { await invoke("save_vram_cap_override", { cap: null }); } catch {}
                  }}
                  className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
                >
                  기본값으로 복원
                </button>
              )}
            </div>
            <p className="text-[10px] text-white/30 leading-relaxed">
              서버 재시작 시 반영 — config.yml의 autosplit_reserve + max_seq_len 동적 계산.
            </p>
          </section>

          {/* Phase 72: 모델 capability 토글 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={9} /> 모델 기능 토글
              <span className="ml-auto text-[9px] text-white/30 font-normal normal-case">모델이 지원할 때만 유효</span>
            </label>

            {/* 비전 */}
            <label className="flex items-center justify-between gap-2 px-3 py-2 bg-white/3 border border-white/5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-purple-300/90">👁 비전 (이미지 입력)</span>
                <span className="text-[9px] text-white/30">Qwen3.5-VL, Gemma VL 등</span>
              </div>
              <input
                type="checkbox"
                checked={config.vision_enabled ?? false}
                onChange={async (e) => {
                  const v = e.target.checked;
                  setConfig((c) => ({ ...c, vision_enabled: v }));
                  try {
                    await invoke("save_capability_toggles", {
                      visionEnabled: v,
                      showReasoning: config.show_reasoning ?? true,
                    });
                  } catch {}
                }}
                className="w-3.5 h-3.5 accent-accent cursor-pointer"
              />
            </label>

            {/* 추론 표시 */}
            <label className="flex items-center justify-between gap-2 px-3 py-2 bg-white/3 border border-white/5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-cyan-300/90">🧠 추론 토큰 표시</span>
                <span className="text-[9px] text-white/30">DeepSeek R1, EXAONE Deep 등</span>
              </div>
              <input
                type="checkbox"
                checked={config.show_reasoning ?? true}
                onChange={async (e) => {
                  const v = e.target.checked;
                  setConfig((c) => ({ ...c, show_reasoning: v }));
                  try {
                    await invoke("save_capability_toggles", {
                      visionEnabled: config.vision_enabled ?? false,
                      showReasoning: v,
                    });
                  } catch {}
                }}
                className="w-3.5 h-3.5 accent-accent cursor-pointer"
              />
            </label>

            <p className="text-[10px] text-white/30 leading-relaxed">
              끄면 추론 모델의 <code className="px-1 bg-white/5 rounded text-[9px]">&lt;think&gt;</code> 체인이 UI에 안 보이고 최종 답만 표시됩니다.
            </p>
          </section>

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

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                <GitFork size={9} /> mistral.rs (단일 추론 엔진)
              </h3>
              <button onClick={checkMistralStatus} className="text-white/30 hover:text-white/60 transition-colors" title="새로고침">
                <RefreshCw size={10} />
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={config.mistral_rs_enabled ?? false}
                onChange={(e) => setConfig((c) => ({ ...c, mistral_rs_enabled: e.target.checked }))}
                className="accent-accent"
              />
              활성화 — Heavy 버튼 또는 <code className="text-purple-400">!!</code> 접두사로 호출
            </label>

            {config.mistral_rs_enabled && (
              <div className="bg-white/3 border border-white/8 rounded-lg p-3 space-y-3">
                {/* 상태 표시 — TabbyAPI와 동일한 스타일 */}
                <div className="flex items-center gap-2">
                  {mistralStatus === null ? (
                    <><Loader2 size={11} className="animate-spin text-white/30" /><span className="text-[11px] text-white/40">확인 중...</span></>
                  ) : mistralStatus.running ? (
                    <><span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" /><span className="text-[11px] text-purple-300 font-medium">실행 중 ({mistralStatus.url})</span></>
                  ) : (
                    <><span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" /><span className="text-[11px] text-yellow-400 font-medium">미실행 — [시작]을 눌러 띄우세요</span></>
                  )}
                </div>

                {/* 추천 프리셋 */}
                <div>
                  <label className="text-[10px] text-white/40 block mb-1">추천 프리셋 (클릭 → 자동 입력)</label>
                  <div className="grid grid-cols-1 gap-1 mb-2 max-h-40 overflow-y-auto pr-1">
                    {catalog.heavy_presets.map((p) => {
                      const active = config.mistral_rs_model === p.id && (config.mistral_rs_gguf_file ?? "") === (p.gguf_file ?? "");
                      const isGguf = !!p.gguf_file;
                      return (
                        <button
                          key={`${p.id}::${p.gguf_file ?? ""}`}
                          onClick={() => setConfig((c) => ({
                            ...c,
                            mistral_rs_model: p.id,
                            mistral_rs_gguf_file: p.gguf_file ?? "",
                          }))}
                          className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] text-left transition-colors border ${
                            active
                              ? "bg-purple-500/20 border-purple-400/40 text-purple-200"
                              : "bg-white/3 border-white/8 text-white/60 hover:bg-white/8"
                          }`}
                        >
                          <span className="truncate">
                            <span className="opacity-70 mr-1">{p.tag}</span>{p.label}
                            {isGguf && <span className="opacity-50 ml-1">[GGUF]</span>}
                          </span>
                          <span className="text-[9px] text-white/30 shrink-0">{p.size}</span>
                        </button>
                      );
                    })}
                  </div>
                  <label className="text-[10px] text-white/40 block mb-1">모델 ID (HuggingFace 또는 로컬 경로)</label>
                  <input
                    value={config.mistral_rs_model ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, mistral_rs_model: e.target.value }))}
                    placeholder="예: deepseek-ai/DeepSeek-R1-Distill-Qwen-32B"
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder-white/20 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-white/40 block mb-1">GGUF 파일 (있으면 GGUF 모드, 비우면 BF16+ISQ)</label>
                  <input
                    value={config.mistral_rs_gguf_file ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, mistral_rs_gguf_file: e.target.value }))}
                    placeholder="예: Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf (비우면 BF16)"
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder-white/20 font-mono"
                  />
                </div>

                <div className={config.mistral_rs_gguf_file ? "opacity-40 pointer-events-none" : ""}>
                  <label className="text-[10px] text-white/40 block mb-1">
                    ISQ 양자화 모드 — 품질 ↔ VRAM 트레이드오프
                    {config.mistral_rs_gguf_file && <span className="ml-1 text-yellow-300/80">(GGUF 모드에선 무시됨)</span>}
                  </label>
                  <select
                    value={config.mistral_rs_isq ?? "Q4K"}
                    onChange={(e) => setConfig((c) => ({ ...c, mistral_rs_isq: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80"
                  >
                    {MISTRAL_ISQ_MODES.map((m) => (
                      <option key={m.value} value={m.value} className="bg-zinc-900">
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[9px] text-white/40 mt-1">
                    {MISTRAL_ISQ_MODES.find((m) => m.value === (config.mistral_rs_isq ?? "Q4K"))?.desc}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] text-white/40 block mb-1">
                    GPU 레이어 수 (수동 override) — 비우면 mistral.rs auto device mapping
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="예: 24 (10GB VRAM에 30B 모델 부분 offload)"
                    value={config.mistral_rs_device_layers ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      // Number("abc") === NaN — type=number에 직접 입력 외 paste 등으로 NaN 방지
                      const n = Number(v);
                      const next = v === "" || Number.isNaN(n) ? undefined : Math.max(0, Math.floor(n));
                      setConfig((c) => ({ ...c, mistral_rs_device_layers: next }));
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder-white/20 font-mono"
                  />
                  <p className="text-[9px] text-white/40 mt-1">
                    OOM 디버깅 또는 30B+ 모델 SSD/RAM offload 강제 시만 설정. 일반적으로 비워두는 게 좋음.
                  </p>
                </div>

                <div>
                  <label className="text-[10px] text-white/40 block mb-1">서버 URL</label>
                  <input
                    value={config.mistral_rs_url ?? "http://127.0.0.1:8080"}
                    onChange={(e) => setConfig((c) => ({ ...c, mistral_rs_url: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80"
                  />
                </div>

                {/* 버튼 — 상태에 따라 conditional 표시 (TabbyAPI 패턴) */}
                <div className="flex gap-2">
                  {!mistralStatus?.running && (
                    <button
                      onClick={handleInstallMistral}
                      disabled={isMistralBusy !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/80 hover:bg-accent text-white text-[11px] rounded font-medium disabled:opacity-50 transition-colors"
                    >
                      {isMistralBusy === "install" ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                      설치
                    </button>
                  )}
                  {!mistralStatus?.running && (
                    <button
                      onClick={handleStartMistral}
                      disabled={isMistralBusy !== null || !config.mistral_rs_model}
                      title={!config.mistral_rs_model ? "먼저 모델을 지정하세요" : "mistral.rs 시작"}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/70 hover:bg-purple-600 text-white text-[11px] rounded font-medium disabled:opacity-40 transition-colors"
                    >
                      {isMistralBusy === "start" ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                      실행
                    </button>
                  )}
                  {mistralStatus?.running && (
                    <button
                      onClick={handleStopMistral}
                      disabled={isMistralBusy !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/60 hover:bg-red-600 text-white text-[11px] rounded font-medium disabled:opacity-50 transition-colors"
                    >
                      {isMistralBusy === "stop" ? <Loader2 size={10} className="animate-spin" /> : <Square size={10} />}
                      중지
                    </button>
                  )}
                </div>

                {/* 빌드 로그 패널 — 설치 진행 중 cargo 출력 표시 */}
                {(isMistralBusy === "install" || mistralLog.length > 0) && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span>📋 빌드 로그 ({mistralLog.length}줄)</span>
                      {mistralLog.length > 0 && (
                        <button
                          onClick={() => setMistralLog([])}
                          className="text-white/30 hover:text-white/60 transition-colors text-[9px]"
                        >
                          지우기
                        </button>
                      )}
                    </div>
                    <div
                      ref={mistralLogRef}
                      className="bg-black/40 border border-white/10 rounded p-2 max-h-48 overflow-y-auto font-mono text-[10px] leading-tight"
                    >
                      {mistralLog.length === 0 && isMistralBusy === "install" ? (
                        <div className="flex items-center gap-1.5 text-white/40">
                          <Loader2 size={10} className="animate-spin" />
                          <span>cargo install 시작 중...</span>
                        </div>
                      ) : (
                        mistralLog.map((line, idx) => (
                          <div
                            key={idx}
                            className={
                              line.includes("error") || line.startsWith("❌") ? "text-red-400" :
                              line.includes("warning") ? "text-yellow-400/70" :
                              line.startsWith("✅") || line.includes("Compiling") || line.includes("Finished") ? "text-green-400/80" :
                              "text-white/50"
                            }
                          >
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-white/30">
                  Heavy 버튼 ON + 자연어 입력 또는 <code className="text-purple-400">!! 이 코드 전체 분석</code>
                  {isMistralBusy === "install" && <span className="block mt-1 text-yellow-400/70">⏳ 첫 설치는 5~15분. cargo가 의존성 다운로드·컴파일 중입니다.</span>}
                </p>
              </div>
            )}
          </section>

          {/* Phase 85b — 임베디드 추론 디버그 (subprocess 없이 LUM 프로세스 안에서 직접) */}
          <EmbeddedInferenceDebug />
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

// ── Phase 85b — 임베디드 추론 디버그 컴포넌트 ──────────────────────────
// embedded-ai feature 빌드일 때만 의미 있음. 비활성 빌드는 stub 에러 반환.
interface EmbedCandidate {
  folder: string;
  folder_label: string;
  gguf_files: string[];
}

const EmbeddedInferenceDebug: React.FC = () => {
  const [candidates, setCandidates] = useState<EmbedCandidate[]>([]);
  const [modelDir, setModelDir] = useState("");
  const [ggufFile, setGgufFile] = useState("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "infer" | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<boolean>("embed_status").then(setLoaded).catch(() => {});
    invoke<EmbedCandidate[]>("list_embed_candidates")
      .then((list) => {
        setCandidates(list);
        // 후보 1개면 자동 선택
        if (list.length === 1) {
          setModelDir(list[0].folder);
          if (list[0].gguf_files.length === 1) setGgufFile(list[0].gguf_files[0]);
        }
      })
      .catch(() => {});
  }, []);

  const currentFolder = candidates.find((c) => c.folder === modelDir);
  const fileOptions = currentFolder?.gguf_files ?? [];

  const onLoad = async () => {
    if (!modelDir.trim() || !ggufFile.trim()) {
      setResponse("❌ model_dir + gguf_file 모두 입력");
      return;
    }
    setBusy("load");
    setResponse(null);
    try {
      const r = await invoke<string>("embed_load_gguf", {
        modelDir: modelDir.trim(),
        ggufFile: ggufFile.trim(),
      });
      setResponse(`✅ ${r}`);
      setLoaded(true);
    } catch (e) {
      setResponse(`❌ ${typeof e === "string" ? e : JSON.stringify(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const onInfer = async () => {
    if (!prompt.trim()) return;
    setBusy("infer");
    setResponse(null);
    try {
      const r = await invoke<string>("embed_infer", { prompt: prompt.trim() });
      setResponse(r);
    } catch (e) {
      setResponse(`❌ ${typeof e === "string" ? e : JSON.stringify(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-2 border border-purple-400/20 rounded-lg p-3 bg-purple-400/5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-300/90 uppercase tracking-wider">
        🧪 임베디드 추론 (Phase 85b — embedded-ai feature)
        <span className={`ml-auto text-[9px] font-mono ${loaded ? "text-green-400" : "text-white/40"}`}>
          {loaded ? "● 로드됨" : "○ 미로드"}
        </span>
      </h3>
      <p className="text-[10px] text-white/40 leading-relaxed">
        mistralrs-server.exe spawn 없이 LUM 프로세스 안에서 직접 추론. <code className="font-mono text-white/55">npm run tauri:dev:cuda</code>로
        빌드해야 동작. 비활성 빌드는 stub 에러 반환.
      </p>

      <div className="space-y-1">
        <span className="text-[10px] text-white/35">
          모델 폴더 ({candidates.length}개 — ~/.lum_mistral_models/)
        </span>
        <select
          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] font-mono outline-none focus:border-purple-400/50 transition-colors"
          value={modelDir}
          onChange={(e) => {
            setModelDir(e.target.value);
            // 폴더 바뀌면 그 폴더의 GGUF 1개면 자동 선택, 아니면 비움
            const c = candidates.find((x) => x.folder === e.target.value);
            setGgufFile(c?.gguf_files.length === 1 ? c.gguf_files[0] : "");
          }}
        >
          <option value="">(폴더 선택)</option>
          {candidates.map((c) => (
            <option key={c.folder} value={c.folder}>{c.folder_label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <span className="text-[10px] text-white/35">
          GGUF 파일 ({fileOptions.length}개)
        </span>
        <select
          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] font-mono outline-none focus:border-purple-400/50 transition-colors disabled:opacity-50"
          value={ggufFile}
          onChange={(e) => setGgufFile(e.target.value)}
          disabled={fileOptions.length === 0}
        >
          <option value="">{fileOptions.length === 0 ? "(폴더 먼저 선택)" : "(파일 선택)"}</option>
          {fileOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      {candidates.length === 0 && (
        <p className="text-[10px] text-yellow-400/60">
          ~/.lum_mistral_models/ 안에 GGUF 모델 폴더가 없습니다. 모델을 다운로드하세요.
        </p>
      )}
      <button
        onClick={onLoad}
        disabled={busy !== null || !modelDir.trim() || !ggufFile.trim()}
        className="w-full px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-[11px] text-purple-200 disabled:opacity-40 transition-colors"
      >
        {busy === "load" ? "로드 중... (수십초~분)" : "🚀 임베디드 로드"}
      </button>

      <div className="space-y-1 pt-1">
        <span className="text-[10px] text-white/35">프롬프트</span>
        <textarea
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] font-mono outline-none focus:border-purple-400/50 transition-colors resize-none"
          placeholder="Hello, world!"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>
      <button
        onClick={onInfer}
        disabled={busy !== null || !prompt.trim() || !loaded}
        className="w-full px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-[11px] text-purple-200 disabled:opacity-40 transition-colors"
      >
        {busy === "infer" ? "추론 중..." : "💬 임베디드 추론"}
      </button>

      {response && (
        <div className="bg-black/30 border border-white/5 rounded p-2 text-[11px] font-mono text-white/80 max-h-48 overflow-y-auto whitespace-pre-wrap">
          {response}
        </div>
      )}
    </section>
  );
};

export default XllmPanel;
