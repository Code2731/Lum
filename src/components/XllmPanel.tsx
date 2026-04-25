import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  SlidersHorizontal, Loader2, X, RefreshCw, ArrowLeftRight,
  Zap, Database, Cpu, CheckCircle2, GitFork, Sparkles,
  Download, Play, Square, AlertTriangle,
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
  sparse_attention?: boolean;
  sparse_top_k?: number;
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
}

type SafetyMode = "safe" | "balanced" | "max";
const MODE_DEFAULTS: Record<SafetyMode, number> = { safe: 0.70, balanced: 0.80, max: 0.90 };

// Heavy Track 추천 모델 프리셋 — mistral.rs는 HF ID로 직접 다운로드/로드
const HEAVY_PRESETS: { label: string; id: string; size: string; tag: string }[] = [
  { label: "DeepSeek R1 Distill 32B (추론)",    id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",      size: "~19GB", tag: "🧠 추론" },
  { label: "Qwen2.5-Coder 32B (코딩)",          id: "Qwen/Qwen2.5-Coder-32B-Instruct",                size: "~19GB", tag: "⚡ 코딩" },
  { label: "Qwen3 32B (범용 최신)",             id: "Qwen/Qwen3-32B-Instruct",                        size: "~19GB", tag: "🆕 범용" },
  { label: "Qwen3 30B-A3B MoE (빠른 32B)",      id: "Qwen/Qwen3-30B-A3B-Instruct",                    size: "~17GB", tag: "🚀 MoE" },
  { label: "EXAONE 3.5 32B (한국어)",           id: "LGAI-EXAONE/EXAONE-3.5-32B-Instruct",            size: "~19GB", tag: "🇰🇷 한국어" },
  { label: "EXAONE Deep 32B (한국어 추론)",     id: "LGAI-EXAONE/EXAONE-Deep-32B",                    size: "~19GB", tag: "🇰🇷🧠" },
  { label: "Mistral Small 24B",                 id: "mistralai/Mistral-Small-24B-Instruct-2501",      size: "~14GB", tag: "🇫🇷 균형" },
  { label: "Gemma 3 27B",                       id: "google/gemma-3-27b-it",                          size: "~16GB", tag: "🤖 Google" },
  { label: "Llama 3.3 70B (멀티GPU)",            id: "meta-llama/Llama-3.3-70B-Instruct",              size: "~40GB", tag: "🦙 Meta" },
];

interface ModelInfo {
  id: string;
  max_seq_len?: number;
  cache_mode?: string;
  rope_scale?: number;
}

interface TabbyApiStatus {
  installed: boolean;
  running: boolean;
  port: number | null;
  version: string | null;
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

function errMsg(e: unknown): string {
  if (!e) return "알 수 없는 오류";
  if (typeof e === "string") return e;
  const obj = e as Record<string, unknown>;
  return (obj.message as string) ?? JSON.stringify(e);
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

  // TabbyAPI / MLX-LM 상태
  const [tabbyStatus, setTabbyStatus] = useState<TabbyApiStatus | null>(null);
  const [isCheckingTabby, setIsCheckingTabby] = useState(false);
  const [isInstallingTabby, setIsInstallingTabby] = useState(false);
  const [isStartingTabby, setIsStartingTabby] = useState(false);
  const [installLog, setInstallLog] = useState<string | null>(null);
  const [recommendedPort, setRecommendedPort] = useState(5001);
  const [dlProgress, setDlProgress] = useState<{ percent: number; done: boolean } | null>(null);
  const [isAppleSilicon, setIsAppleSilicon] = useState(false);
  const [isIntelMac, setIsIntelMac] = useState(false);
  const [selectedMlxModel, setSelectedMlxModel] = useState("mlx-community/Qwen2.5-Coder-7B-Instruct-4bit");
  const [localModels, setLocalModels] = useState<{ id: string; size_mb: number }[]>([]);

  useEffect(() => {
    return () => { if (switchTimerRef.current) clearTimeout(switchTimerRef.current); };
  }, []);

  const checkTabbyStatus = useCallback(() => {
    setIsCheckingTabby(true);
    invoke<TabbyApiStatus>("check_tabbyapi_status")
      .then((s) => {
        setTabbyStatus(s);
        if (s.running && s.port) {
          setConfig((c) => ({ ...c, xllm_base_url: `http://127.0.0.1:${s.port}` }));
          // 서버 실행 중이면 모델 정보도 갱신
          refreshModelInfo();
        }
      })
      .catch(() => setTabbyStatus({ installed: false, running: false, port: null, version: null }))
      .finally(() => setIsCheckingTabby(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    invoke<AppConfig>("load_app_config").then(setConfig).catch(() => {});
    invoke<string>("get_platform_arch").then((a) => {
      setIsAppleSilicon(a === "aarch64");
      setIsIntelMac(a === "intel-mac");
    }).catch(() => {});
    invoke<{ id: string; size_mb: number }[]>("list_local_models")
      .then((m) => setLocalModels(m.filter((x) => x.size_mb > 0)))
      .catch(() => {});
    refreshModelInfo();
    checkTabbyStatus();
    invoke<number>("get_recommended_port").then(setRecommendedPort).catch(() => {});
  }, []);

  // 설치 진행 로그 수신
  useEffect(() => {
    const unlisten = listen<string>("tabbyapi_install_progress", (e) => {
      setInstallLog(e.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // 모델 다운로드 진행률 수신
  useEffect(() => {
    const unlisten = listen<{ percent: number; done: boolean }>("mlx_download_progress", (e) => {
      setDlProgress(e.payload);
      if (e.payload.done) {
        setTimeout(() => {
          setDlProgress(null);
          checkTabbyStatus();
          refreshModelInfo();
        }, 2000);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [checkTabbyStatus]);

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
        serverUrl: config.xllm_base_url ?? null,
        cacheMode: config.cache_mode ?? null,
        codingModel: config.coding_model ?? null,
        docModel: config.doc_model ?? null,
        pdThresholdChars: config.pd_threshold_chars ?? null,
        maxSeqLen: config.max_seq_len ?? null,
        draftModel: config.draft_model ?? null,
        speculativeNDraft: config.speculative_n_draft ?? null,
        sparseAttention: config.sparse_attention ?? null,
        sparseTopK: config.sparse_top_k ?? null,
        mistralRsEnabled: config.mistral_rs_enabled ?? null,
        mistralRsUrl: config.mistral_rs_url ?? null,
        mistralRsModel: config.mistral_rs_model ?? null,
      });
      setStatusMsg("설정 저장 완료");
    } catch (e) {
      setStatusMsg(`저장 실패: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  const handleInstallTabby = useCallback(async () => {
    setIsInstallingTabby(true);
    setInstallLog("설치 중...");
    try {
      await invoke("install_tabbyapi");
      checkTabbyStatus();
    } catch (e) {
      setInstallLog(`❌ ${errMsg(e)}`);
    } finally {
      setIsInstallingTabby(false);
    }
  }, [checkTabbyStatus]);

  const handleStartTabby = useCallback(async () => {
    setIsStartingTabby(true);
    try {
      const msg = await invoke<string>("start_tabbyapi", {
        port: recommendedPort,
        model: isAppleSilicon ? selectedMlxModel : null,
      });
      setStatusMsg(msg);
      setTimeout(checkTabbyStatus, 2000);
    } catch (e) {
      setStatusMsg(`시작 실패: ${errMsg(e)}`);
    } finally {
      setIsStartingTabby(false);
    }
  }, [recommendedPort, isAppleSilicon, selectedMlxModel, checkTabbyStatus]);

  const handleStopTabby = useCallback(async () => {
    try {
      const msg = await invoke<string>("stop_tabbyapi");
      setStatusMsg(msg);
      setTimeout(checkTabbyStatus, 1000);
    } catch (e) {
      setStatusMsg(`중지 실패: ${errMsg(e)}`);
    }
  }, [checkTabbyStatus]);

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
      setStatusMsg(`전환 실패: ${errMsg(e)}`);
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

          {/* ── TabbyAPI 상태 ───────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={9} /> TabbyAPI 상태
              </label>
              <button onClick={checkTabbyStatus} className="text-white/30 hover:text-white/60 transition-colors" title="새로고침">
                <RefreshCw size={10} className={isCheckingTabby ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="bg-white/3 border border-white/8 rounded-lg p-3 space-y-3">
              {/* 상태 표시 */}
              <div className="flex items-center gap-2">
                {tabbyStatus === null || isCheckingTabby ? (
                  <><Loader2 size={11} className="animate-spin text-white/30" /><span className="text-[11px] text-white/40">확인 중...</span></>
                ) : tabbyStatus.running ? (
                  <><span className="w-2 h-2 rounded-full bg-green-400 shrink-0" /><span className="text-[11px] text-green-400 font-medium">실행 중 (포트 {tabbyStatus.port})</span></>
                ) : tabbyStatus.installed ? (
                  <><span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" /><span className="text-[11px] text-yellow-400 font-medium">설치됨 — 미실행</span></>
                ) : (
                  <><span className="w-2 h-2 rounded-full bg-red-400 shrink-0" /><span className="text-[11px] text-red-400 font-medium">미설치</span></>
                )}
              </div>

              {/* Apple Silicon 모델 선택 */}
              {isAppleSilicon && tabbyStatus?.installed && !tabbyStatus.running && (
                <div className="space-y-1">
                  <span className="text-[10px] text-white/35">로드할 모델 선택</span>
                  <select
                    value={selectedMlxModel}
                    onChange={(e) => setSelectedMlxModel(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] outline-none focus:border-accent/50 transition-colors"
                  >
                    <option value="mlx-community/Qwen2.5-Coder-7B-Instruct-4bit">Qwen2.5-Coder 7B — 4.5GB (빠름)</option>
                    <option value="mlx-community/Qwen2.5-Coder-14B-Instruct-4bit">Qwen2.5-Coder 14B — 8.5GB (균형)</option>
                    <option value="mlx-community/Qwen2.5-Coder-32B-Instruct-4bit">Qwen2.5-Coder 32B — 19GB ★ 36GB 추천</option>
                    <option value="mlx-community/Llama-3.3-70B-Instruct-4bit">Llama 3.3 70B — 38GB (Ultra 전용)</option>
                  </select>
                </div>
              )}

              {/* Intel Mac 안내 — 설치/실행 불가 */}
              {isIntelMac && (
                <div className="px-3 py-2 rounded bg-yellow-400/5 border border-yellow-400/15 text-[11px] text-yellow-300/80">
                  ⚠ Intel Mac은 로컬 AI 서버(MLX / CUDA)를 지원하지 않습니다. 설정에서 <b>Gemini API</b> 키를 입력해 클라우드 폴백을 사용하세요.
                </div>
              )}

              {/* 버튼 */}
              {!isIntelMac && tabbyStatus && !isCheckingTabby && (
                <div className="flex gap-2">
                  {!tabbyStatus.installed && (
                    <button
                      onClick={handleInstallTabby}
                      disabled={isInstallingTabby}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/80 hover:bg-accent text-white text-[11px] rounded font-medium disabled:opacity-50 transition-colors"
                    >
                      {isInstallingTabby ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                      로컬 AI 서버 설치
                    </button>
                  )}
                  {tabbyStatus.installed && !tabbyStatus.running && (
                    <button
                      onClick={handleStartTabby}
                      disabled={isStartingTabby}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/70 hover:bg-green-600 text-white text-[11px] rounded font-medium disabled:opacity-50 transition-colors"
                    >
                      {isStartingTabby ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                      실행 (포트 {recommendedPort})
                    </button>
                  )}
                  {tabbyStatus.running && (
                    <button
                      onClick={handleStopTabby}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/60 hover:bg-red-600 text-white text-[11px] rounded font-medium transition-colors"
                    >
                      <Square size={10} />
                      중지
                    </button>
                  )}
                </div>
              )}

              {/* 포트 충돌 경고 */}
              {recommendedPort !== 5000 && !tabbyStatus?.running && (
                <p className="text-[10px] text-yellow-400/70 flex items-center gap-1">
                  <AlertTriangle size={9} />
                  포트 5000이 사용 중 (AirPlay 등) — 포트 {recommendedPort}로 실행됩니다
                </p>
              )}

              {/* 모델 다운로드 프로그레스 바 */}
              {dlProgress && !dlProgress.done && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-white/50">
                    <span>모델 다운로드 중...</span>
                    <span>{dlProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${dlProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
              {dlProgress?.done && (
                <p className="text-[10px] text-green-400 font-medium">✅ 모델 로드 완료 — AI 사용 가능!</p>
              )}

              {/* 설치 로그 */}
              {installLog && !dlProgress && (
                <p className={`text-[10px] leading-relaxed ${installLog.startsWith("❌") ? "text-red-400" : "text-white/50"}`}>
                  {installLog}
                </p>
              )}
            </div>
          </section>

          {/* 서버 URL */}
          <section className="space-y-1.5">
            <label className="text-[10px] text-white/40 uppercase tracking-wider">
              AI 서버 주소
            </label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
              placeholder="http://127.0.0.1:5000"
              value={config.xllm_base_url ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, xllm_base_url: e.target.value }))}
            />
            <p className="text-[10px] text-white/25 leading-relaxed">
              MLX-LM(Apple): <span className="font-mono text-white/35">:5000</span>
              &nbsp;·&nbsp;
              TabbyAPI(NVIDIA): <span className="font-mono text-white/35">:5000</span>
              &nbsp;·&nbsp;
              LM Studio: <span className="font-mono text-white/35">:1234</span>
              &nbsp;·&nbsp;
              Ollama: <span className="font-mono text-white/35">:11434</span>
            </p>
          </section>

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

          {/* Max Tokens (모든 플랫폼 동작) */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu size={9} /> Max Tokens (응답 최대 길이)
              <span className="ml-auto text-[9px] text-green-400/70 font-normal normal-case">✅ MLX-LM + TabbyAPI</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="w-32 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                value={config.max_seq_len ?? 4096}
                min={512}
                max={32768}
                step={512}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, max_seq_len: parseInt(e.target.value) || 4096 }))
                }
              />
              <span className="text-[11px] text-white/35">
                {isAppleSilicon ? "36GB → 8192~16384 권장" : "Q4 캐시 + 36GB → 32768 이상도 가능"}
              </span>
            </div>
          </section>

          {/* ① PD 임계값 (긴 컨텍스트 온도 조절 — MLX-LM 동작) */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Zap size={9} /> ① 긴 컨텍스트 자동 최적화
              <span className="ml-auto text-[9px] text-green-400/70 font-normal normal-case">✅ MLX-LM + TabbyAPI</span>
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
                chars 초과 시 temperature 0.3 자동 전환
              </span>
            </div>
          </section>

          {/* ③ KV Cache — NVIDIA 전용 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Database size={9} /> ③ KV Cache Quantization
              {isAppleSilicon
                ? <span className="ml-auto text-[9px] text-yellow-400/70 font-normal normal-case">⚠ TabbyAPI(NVIDIA) 전용</span>
                : <span className="ml-auto text-[9px] text-green-400/70 font-normal normal-case">✅ TabbyAPI</span>}
            </label>
            {isAppleSilicon ? (
              <p className="text-[10px] text-white/25 bg-yellow-400/5 border border-yellow-400/10 rounded px-2.5 py-2">
                MLX-LM은 KV Cache 양자화를 API 파라미터로 지원하지 않습니다.
                MLX는 자체적으로 Metal 가속 캐시를 사용합니다.
              </p>
            ) : (
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
            )}
          </section>

          {/* ② 모델 역할 분리 — NVIDIA 전용 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowLeftRight size={9} /> ② 모델 역할 분리 (Elastic Scheduling)
              {isAppleSilicon
                ? <span className="ml-auto text-[9px] text-yellow-400/70 font-normal normal-case">⚠ TabbyAPI(NVIDIA) 전용</span>
                : <span className="ml-auto text-[9px] text-green-400/70 font-normal normal-case">✅ TabbyAPI</span>}
            </label>
            {isAppleSilicon ? (
              <p className="text-[10px] text-white/25 bg-yellow-400/5 border border-yellow-400/10 rounded px-2.5 py-2">
                MLX-LM은 서버에 모델 1개만 로드합니다. 역할별 모델 분리는 TabbyAPI(NVIDIA)에서만 동작합니다.
              </p>
            ) : (
              <div className="space-y-2">
                {localModels.length === 0 && (
                  <p className="text-[10px] text-yellow-400/70 bg-yellow-400/5 border border-yellow-400/10 rounded px-2.5 py-1.5">
                    ⚠ 다운로드된 모델이 없습니다. 모델 관리자에서 먼저 모델을 다운로드하세요.
                  </p>
                )}
                <div className="space-y-1">
                  <span className="text-[10px] text-white/30">코딩 모델 (generate_ai_command, git commit)</span>
                  <select
                    className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
                    value={config.coding_model ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, coding_model: e.target.value || undefined }))}
                    disabled={localModels.length === 0}
                  >
                    <option value="">(기본 모델 사용)</option>
                    {localModels.map((m) => (
                      <option key={`c-${m.id}`} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-white/30">문서화 모델 (analyze_error, 요약)</span>
                  <select
                    className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
                    value={config.doc_model ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, doc_model: e.target.value || undefined }))}
                    disabled={localModels.length === 0}
                  >
                    <option value="">(기본 모델 사용)</option>
                    {localModels.map((m) => (
                      <option key={`d-${m.id}`} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>

          {/* ④ SSD — Apple: 서버 시작 옵션 / NVIDIA: 요청 파라미터 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <GitFork size={9} /> ④ SSD — Speculative Decoding
              {isAppleSilicon
                ? <span className="ml-auto text-[9px] text-yellow-400/70 font-normal normal-case">⚠ 서버 시작 시 적용</span>
                : <span className="ml-auto text-[9px] text-green-400/70 font-normal normal-case">✅ TabbyAPI</span>}
            </label>
            <p className="text-[10px] text-white/25 -mt-1">
              소형 드래프트 모델이 다음 토큰을 미리 추측 → 1.5~2× 속도 향상
            </p>
            {isAppleSilicon ? (
              <p className="text-[10px] text-white/25 bg-yellow-400/5 border border-yellow-400/10 rounded px-2.5 py-2">
                MLX-LM의 Speculative Decoding은 서버 시작 시 <code className="font-mono text-white/40">--draft-model</code> 플래그로만 설정 가능합니다.
                현재 MLX-LM은 API 요청 단위 드래프트 모델 지정을 지원하지 않습니다.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-white/30">드래프트 모델</span>
                  <select
                    className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
                    value={config.draft_model ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, draft_model: e.target.value || undefined }))}
                    disabled={localModels.length === 0}
                  >
                    <option value="">(사용 안 함)</option>
                    {localModels.map((m) => (
                      <option key={`draft-${m.id}`} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                  {localModels.length === 0 && (
                    <p className="text-[10px] text-yellow-400/60">다운로드된 모델이 없습니다.</p>
                  )}
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
                  <span className="text-[11px] text-white/25">권장 4–8</span>
                </div>
              </div>
            )}
          </section>

          {/* ⑤ Dynamic Sparse Attention — NVIDIA 전용 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={9} /> ⑤ Dynamic Sparse Attention
              {isAppleSilicon
                ? <span className="ml-auto text-[9px] text-yellow-400/70 font-normal normal-case">⚠ TabbyAPI(NVIDIA) 전용</span>
                : <span className="ml-auto text-[9px] text-green-400/70 font-normal normal-case">✅ TabbyAPI</span>}
            </label>
            {isAppleSilicon ? (
              <p className="text-[10px] text-white/25 bg-yellow-400/5 border border-yellow-400/10 rounded px-2.5 py-2">
                MLX-LM은 Dynamic Sparse Attention을 지원하지 않습니다.
                긴 컨텍스트는 Apple Metal의 Flash Attention으로 처리됩니다.
              </p>
            ) : (
              <>
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
              </>
            )}
          </section>

          {/* 모델 전환 */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider">
              모델 전환 (Fast Role Reversal)
            </label>
            <div className="flex gap-2">
              <select
                className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
                value={switchTarget}
                onChange={(e) => setSwitchTarget(e.target.value)}
                disabled={localModels.length === 0}
              >
                <option value="">(전환할 모델 선택)</option>
                {localModels.map((m) => (
                  <option key={`sw-${m.id}`} value={m.id}>{m.id}</option>
                ))}
              </select>
              <button
                onClick={handleSwitch}
                disabled={isSwitching || !switchTarget.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs shrink-0"
              >
                {isSwitching ? <Loader2 size={11} className="animate-spin" /> : <ArrowLeftRight size={11} />}
                전환
              </button>
            </div>
            {localModels.length === 0 && (
              <p className="text-[10px] text-yellow-400/60">다운로드된 모델이 없습니다 — 모델 관리자에서 먼저 다운로드하세요.</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              <GitFork size={9} /> Heavy Track (mistral.rs · 30B+)
            </h3>
            <label className="flex items-center gap-2 text-xs text-white/60 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.mistral_rs_enabled ?? false}
                onChange={(e) => setConfig((c) => ({ ...c, mistral_rs_enabled: e.target.checked }))}
                className="accent-accent"
              />
              활성화 — <code className="text-purple-400">!!</code> 접두사로 Heavy Track 호출
            </label>
            {config.mistral_rs_enabled && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-white/40 block mb-1">추천 프리셋 (클릭 → 자동 입력)</label>
                  <div className="grid grid-cols-1 gap-1 mb-2 max-h-40 overflow-y-auto pr-1">
                    {HEAVY_PRESETS.map((p) => {
                      const active = config.mistral_rs_model === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setConfig((c) => ({ ...c, mistral_rs_model: p.id }))}
                          className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] text-left transition-colors border ${
                            active
                              ? "bg-purple-500/20 border-purple-400/40 text-purple-200"
                              : "bg-white/3 border-white/8 text-white/60 hover:bg-white/8"
                          }`}
                        >
                          <span className="truncate"><span className="opacity-70 mr-1">{p.tag}</span>{p.label}</span>
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
                  <label className="text-[10px] text-white/40 block mb-1">서버 URL</label>
                  <input
                    value={config.mistral_rs_url ?? "http://127.0.0.1:8080"}
                    onChange={(e) => setConfig((c) => ({ ...c, mistral_rs_url: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => invoke("install_mistral_rs").then(() => setStatusMsg("mistral.rs 설치 완료"))}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/60 text-xs transition-colors"
                  >
                    <Download size={10} /> 설치
                  </button>
                  <button
                    onClick={() => invoke("start_mistral_rs").then(() => setStatusMsg("mistral.rs 시작됨"))}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs transition-colors"
                  >
                    <Play size={10} /> 시작
                  </button>
                  <button
                    onClick={() => invoke("stop_mistral_rs").then(() => setStatusMsg("mistral.rs 종료됨"))}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/60 text-xs transition-colors"
                  >
                    <Square size={10} /> 종료
                  </button>
                </div>
                <p className="text-[10px] text-white/30">
                  <code className="text-purple-400">!! 번역해줘</code> 또는 <code className="text-purple-400">!! 이 코드 전체 분석</code>
                </p>
              </div>
            )}
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
