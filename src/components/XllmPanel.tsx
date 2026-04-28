import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  SlidersHorizontal, Loader2, X, RefreshCw,
  Zap, Cpu, Sparkles,
} from "lucide-react";
import { shortPath } from "../utils";

interface AppConfig {
  coding_model?: string;
  doc_model?: string;
  pd_threshold_chars?: number;
  max_seq_len?: number;
  xllm_admin_key?: string;
  safety_mode?: string;
  vram_cap_override?: number;
  vision_enabled?: boolean;
  show_reasoning?: boolean;
}

type SafetyMode = "safe" | "balanced" | "max";
const MODE_DEFAULTS: Record<SafetyMode, number> = { safe: 0.70, balanced: 0.80, max: 0.90 };

interface ModelInfo {
  id: string;
  max_seq_len?: number;
  rope_scale?: number;
}

interface Props {
  onClose: () => void;
}

const XllmPanel: React.FC<Props> = ({ onClose }) => {
  const [config, setConfig] = useState<AppConfig>({});
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  useEffect(() => {
    invoke<AppConfig>("load_app_config").then(setConfig).catch(() => {});
    refreshModelInfo();
  }, []);

  const refreshModelInfo = useCallback(() => {
    setIsLoadingInfo(true);
    invoke<ModelInfo>("get_xllm_model_info")
      .then(setModelInfo)
      .catch(() => setModelInfo(null))
      .finally(() => setIsLoadingInfo(false));
  }, []);

  const vramCapPct = Math.round(
    (config.vram_cap_override ?? MODE_DEFAULTS[(config.safety_mode as SafetyMode) ?? "balanced"]) * 100
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await invoke("save_xllm_settings", {
        cacheMode: null,
        codingModel: config.coding_model ?? null,
        docModel: config.doc_model ?? null,
        pdThresholdChars: config.pd_threshold_chars ?? null,
        maxSeqLen: config.max_seq_len ?? null,
        draftModel: null,
        speculativeNDraft: null,
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

          {/* GPU 안전 모드 + VRAM Cap */}
          <section className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Zap size={9} /> GPU VRAM 안전 모드
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
                <span className="font-mono text-white/70">{vramCapPct}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={95}
                step={1}
                value={vramCapPct}
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
              {config.vram_cap_override !== undefined && (
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
                  {modelInfo.rope_scale && <span>rope: ×{modelInfo.rope_scale.toFixed(1)}</span>}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-white/25 italic">xLLM 서버 미연결</p>
            )}
          </section>

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

// ── Phase 85b / Phase 88 — 임베디드 추론 (모델 핫스왑 지원) ──────────────
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
  const [busy, setBusy] = useState<"load" | "unload" | "infer" | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadElapsed, setLoadElapsed] = useState(0);
  const [loadStage, setLoadStage] = useState<string | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshLoadedKey = useCallback(() => {
    invoke<string | null>("embed_loaded_info").then(setLoadedKey).catch(() => setLoadedKey(null));
  }, []);

  useEffect(() => {
    refreshLoadedKey();
    invoke<EmbedCandidate[]>("list_embed_candidates")
      .then((list) => {
        setCandidates(list);
        if (list.length === 1) {
          setModelDir(list[0].folder);
          if (list[0].gguf_files.length === 1) setGgufFile(list[0].gguf_files[0]);
        }
      })
      .catch(() => {});
    const unlisten = listen<string>("embed_load_progress", (e) => setLoadStage(e.payload));
    return () => { unlisten.then((f) => f()); };
  }, [refreshLoadedKey]);

  const currentFolder = candidates.find((c) => c.folder === modelDir);
  const fileOptions = currentFolder?.gguf_files ?? [];

  // 선택된 모델이 현재 로드된 모델과 동일한지
  const selectedKey = modelDir && ggufFile ? `${modelDir}/${ggufFile}` : null;
  const isSameModel = !!loadedKey && loadedKey === selectedKey;

  const onLoad = async () => {
    if (!modelDir.trim() || !ggufFile.trim()) {
      setResponse("❌ 모델 폴더와 GGUF 파일을 선택하세요");
      return;
    }
    setBusy("load");
    setResponse(null);
    setLoadStage(null);
    const startMs = Date.now();
    loadTimerRef.current = setInterval(() => {
      setLoadElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    try {
      const r = await invoke<string>("embed_load_gguf", {
        modelDir: modelDir.trim(),
        ggufFile: ggufFile.trim(),
      });
      setResponse(`✅ ${r}`);
      refreshLoadedKey();
    } catch (e) {
      setResponse(`❌ ${typeof e === "string" ? e : JSON.stringify(e)}`);
    } finally {
      if (loadTimerRef.current) { clearInterval(loadTimerRef.current); loadTimerRef.current = null; }
      setLoadElapsed(0);
      setBusy(null);
    }
  };

  const onUnload = async () => {
    setBusy("unload");
    setResponse(null);
    try {
      await invoke("embed_unload");
      setResponse("🗑 모델 언로드 완료 (VRAM 해제)");
      refreshLoadedKey();
    } catch (e) {
      setResponse(`❌ ${typeof e === "string" ? e : JSON.stringify(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const onInfer = async () => {
    if (!prompt.trim()) return;
    setBusy("infer");
    setResponse("");
    let accumulated = "";
    const unlisten = await listen<string>("embed_token", (e) => {
      accumulated += e.payload;
      setResponse(accumulated);
    });
    try {
      await invoke<string>("embed_infer_stream", { prompt: prompt.trim() });
    } catch (e) {
      setResponse(`❌ ${typeof e === "string" ? e : JSON.stringify(e)}`);
    } finally {
      unlisten();
      setBusy(null);
    }
  };

  const onCancelInfer = async () => {
    try { await invoke("cancel_ai_stream"); } catch { }
  };

  const loadedFilename = loadedKey ? shortPath(loadedKey) : null;

  return (
    <section className="space-y-2 border border-purple-400/20 rounded-lg p-3 bg-purple-400/5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-300/90 uppercase tracking-wider">
        🧪 임베디드 추론
        <span className={`ml-auto text-[9px] font-mono truncate max-w-[180px] ${loadedKey ? "text-green-400" : "text-white/40"}`}
          title={loadedKey ?? undefined}>
          {loadedKey ? `● ${loadedFilename}` : "○ 미로드"}
        </span>
      </h3>
      <p className="text-[10px] text-white/40 leading-relaxed">
        <code className="font-mono text-white/55">npm run tauri:dev:cuda</code> 빌드 전용.
        다른 모델 선택 후 로드하면 VRAM 교체(핫스왑).
      </p>

      <div className="space-y-1">
        <span className="text-[10px] text-white/35">모델 폴더 ({candidates.length}개)</span>
        <select
          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] font-mono outline-none focus:border-purple-400/50 transition-colors"
          value={modelDir}
          onChange={(e) => {
            setModelDir(e.target.value);
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
        <span className="text-[10px] text-white/35">GGUF 파일 ({fileOptions.length}개)</span>
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
          ~/.lum_mistral_models/ 에 GGUF 모델이 없습니다. 모델 관리 탭에서 다운로드하세요.
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          onClick={onLoad}
          disabled={busy !== null || !modelDir.trim() || !ggufFile.trim()}
          className="flex-1 px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-[11px] text-purple-200 disabled:opacity-40 transition-colors"
        >
          {busy === "load"
            ? `🔄 로드 중... ${loadElapsed}초`
            : isSameModel
              ? "✅ 로드됨 (재로드)"
              : loadedKey
                ? "🔄 모델 교체 (핫스왑)"
                : "🚀 임베디드 로드"}
        </button>
        {loadedKey && (
          <button
            onClick={onUnload}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-400/20 text-[11px] text-red-300 disabled:opacity-40 transition-colors"
            title="VRAM에서 모델 해제"
          >
            {busy === "unload" ? "해제 중..." : "🗑 언로드"}
          </button>
        )}
      </div>
      {busy === "load" && loadStage && (
        <p className="text-[10px] font-mono text-purple-300/60 truncate">{loadStage}</p>
      )}

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
      <div className="flex gap-1.5">
        <button
          onClick={onInfer}
          disabled={busy !== null || !prompt.trim() || !loadedKey}
          className="flex-1 px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-[11px] text-purple-200 disabled:opacity-40 transition-colors"
        >
          {busy === "infer" ? "🔴 토큰 스트림 중..." : "💬 임베디드 추론 (스트리밍)"}
        </button>
        {busy === "infer" && (
          <button
            onClick={onCancelInfer}
            className="px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-400/20 text-[11px] text-red-300 transition-colors"
            title="추론 중단"
          >
            ⛔ 중단
          </button>
        )}
      </div>

      {response && (
        <div className="bg-black/30 border border-white/5 rounded p-2 text-[11px] font-mono text-white/80 max-h-48 overflow-y-auto whitespace-pre-wrap">
          {response}
        </div>
      )}
    </section>
  );
};

export default XllmPanel;
