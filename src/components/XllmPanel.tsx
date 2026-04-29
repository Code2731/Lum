import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  SlidersHorizontal, Loader2,
  Zap, Sparkles, FolderOpen,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { shortPath, parsePathComponents, parseLoadedKey } from "../utils";

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
  ollama_base_url?: string;
  ollama_model?: string;
}

type SafetyMode = "safe" | "balanced" | "max";
const MODE_DEFAULTS: Record<SafetyMode, number> = { safe: 0.70, balanced: 0.80, max: 0.90 };

interface Props {
  onClose: () => void;
}

const XllmPanel: React.FC<Props> = ({ onClose }) => {
  const [config, setConfig] = useState<AppConfig>({});
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppConfig>("load_app_config").then(setConfig).catch(() => {});
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg top-[12%] translate-y-0 max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-xl">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 shrink-0">
          <SlidersHorizontal size={13} className="text-accent shrink-0" />
          <DialogTitle className="text-xs font-semibold">xLLM 실전 최적화 설정</DialogTitle>
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
              <Slider
                min={50}
                max={95}
                step={1}
                value={[vramCapPct]}
                onValueChange={async ([pct]) => {
                  const cap = pct / 100;
                  setConfig((c) => ({ ...c, vram_cap_override: cap }));
                  try { await invoke("save_vram_cap_override", { cap }); } catch {}
                }}
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
              <Switch
                checked={config.vision_enabled ?? false}
                onCheckedChange={async (v) => {
                  setConfig((c) => ({ ...c, vision_enabled: v }));
                  try { await invoke("save_capability_toggles", { visionEnabled: v, showReasoning: config.show_reasoning ?? true }); } catch {}
                }}
                className="scale-75"
              />
            </label>

            {/* 추론 표시 */}
            <label className="flex items-center justify-between gap-2 px-3 py-2 bg-white/3 border border-white/5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-cyan-300/90">🧠 추론 토큰 표시</span>
                <span className="text-[9px] text-white/30">DeepSeek R1, EXAONE Deep 등</span>
              </div>
              <Switch
                checked={config.show_reasoning ?? true}
                onCheckedChange={async (v) => {
                  setConfig((c) => ({ ...c, show_reasoning: v }));
                  try { await invoke("save_capability_toggles", { visionEnabled: config.vision_enabled ?? false, showReasoning: v }); } catch {}
                }}
                className="scale-75"
              />
            </label>

            <p className="text-[10px] text-white/30 leading-relaxed">
              끄면 추론 모델의 <code className="px-1 bg-white/5 rounded text-[9px]">&lt;think&gt;</code> 체인이 UI에 안 보이고 최종 답만 표시됩니다.
            </p>
          </section>

          <OllamaSection />
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
      </DialogContent>
    </Dialog>
  );
};

// ── Ollama 백엔드 섹션 ──────────────────────────────────────────────────────

const OllamaSection: React.FC = () => {
  const [url, setUrl] = useState("http://localhost:11434");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppConfig>("load_app_config").then((c) => {
      if (c.ollama_base_url) setUrl(c.ollama_base_url);
      if (c.ollama_model) setModel(c.ollama_model);
    }).catch(() => {});
  }, []);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    setStatus("unknown");
    setModels([]);
    try {
      const ok = await invoke<boolean>("check_ollama_status");
      setStatus(ok ? "online" : "offline");
      if (ok) {
        const list = await invoke<string[]>("list_ollama_models").catch(() => []);
        setModels(list);
      }
    } catch {
      setStatus("offline");
    } finally {
      setChecking(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMsg(null);
    try {
      await invoke("save_ollama_settings", {
        baseUrl: url.trim() || null,
        model: model.trim() || null,
      });
      setMsg("저장 완료");
    } catch (e) {
      setMsg(`저장 실패: ${e}`);
    } finally {
      setSaving(false);
    }
  }, [url, model]);

  const statusColor =
    status === "online" ? "text-green-400" : status === "offline" ? "text-red-400" : "text-white/40";
  const statusLabel =
    status === "online" ? "● 온라인" : status === "offline" ? "○ 오프라인" : "○ 미확인";

  return (
    <section className="space-y-2 border border-orange-400/20 rounded-lg p-3 bg-orange-400/5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-300/90 uppercase tracking-wider">
        🦙 Ollama 백엔드
        <span className={`ml-auto text-[9px] font-mono ${statusColor}`}>{statusLabel}</span>
      </h3>
      <p className="text-[10px] text-white/40 leading-relaxed">
        로컬 Ollama가 실행 중이면 embedded 미로드 시 자동 폴백. xLLM보다 우선.
      </p>

      <div className="space-y-1">
        <span className="text-[10px] text-white/35">서버 URL</span>
        <div className="flex gap-1.5">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="flex-1 font-mono text-[11px] focus:border-orange-400/40"
          />
          <button
            onClick={checkStatus}
            disabled={checking}
            className="px-2.5 py-1 rounded border border-orange-400/30 bg-orange-500/10 hover:bg-orange-500/20 text-[11px] text-orange-200 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {checking ? "확인 중..." : "연결 확인"}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] text-white/35">모델</span>
        {models.length > 0 ? (
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="(모델 선택)" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="예: llama3.2:3b, qwen2.5-coder:7b"
            className="font-mono text-[11px] focus:border-orange-400/40"
          />
        )}
        {status === "offline" && (
          <p className="text-[10px] text-red-400/80">
            Ollama 서버 미응답 — <code className="text-[9px]">ollama serve</code> 실행 후 재확인
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-orange-500/15 hover:bg-orange-500/25 border border-orange-400/25 text-[11px] text-orange-200 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : null}
          저장
        </button>
        {msg && <span className="text-[10px] text-white/50">{msg}</span>}
      </div>
    </section>
  );
};

// ── Phase 85b / Phase 88 — 임베디드 추론 (모델 핫스왑 지원) ──────────────
interface EmbedCandidate {
  folder: string;
  folder_label: string;
  gguf_files: string[];
  has_safetensors: boolean;
}

interface LoraCandidate {
  folder: string;
  folder_label: string;
}

const LORA_NONE = "__none__";
const LORA_MANUAL = "__manual__";

const EmbeddedInferenceDebug: React.FC = () => {
  const [candidates, setCandidates] = useState<EmbedCandidate[]>([]);
  const [loraCandidates, setLoraCandidates] = useState<LoraCandidate[]>([]);
  const [modelDir, setModelDir] = useState("");
  const [ggufFile, setGgufFile] = useState("");
  const [isqType, setIsqType] = useState("Q4K");
  const [loraPath, setLoraPath] = useState("");
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
    invoke<LoraCandidate[]>("list_lora_candidates").then(setLoraCandidates).catch(() => {});
    const unlisten = listen<string>("embed_load_progress", (e) => setLoadStage(e.payload));
    return () => { unlisten.then((f) => f()); };
  }, [refreshLoadedKey]);

  const currentFolder = candidates.find((c) => c.folder === modelDir);
  const fileOptions = currentFolder?.gguf_files ?? [];
  // GGUF 없고 safetensors 있는 폴더 → BF16+ISQ 모드
  const isSafetensorsMode = !!(currentFolder?.has_safetensors && fileOptions.length === 0);
  const loraTrimmed = loraPath.trim();

  const { base: baseLoadedKey, lora: loraLoadedPath, isq: isqLoaded } = loadedKey
    ? parseLoadedKey(loadedKey)
    : { base: "", lora: "", isq: "" };
  const loadedFilename = baseLoadedKey ? shortPath(baseLoadedKey) : null;
  const loadedLoraName = loraLoadedPath ? shortPath(loraLoadedPath) : null;

  // LoRA Select 파생값: 스캔된 폴더 선택 / 직접 입력 / 없음
  const loraSelectValue = loraTrimmed === ""
    ? LORA_NONE
    : loraCandidates.some((c) => c.folder === loraTrimmed)
      ? loraTrimmed
      : LORA_MANUAL;

  const selectedKey = modelDir
    ? isSafetensorsMode
      ? `${modelDir}+isq:${isqType}`
      : ggufFile
        ? loraTrimmed ? `${modelDir}/${ggufFile}+lora:${loraTrimmed}` : `${modelDir}/${ggufFile}`
        : null
    : null;
  const isSameModel = !!loadedKey && loadedKey === selectedKey;

  const onLoad = async () => {
    if (!modelDir.trim()) {
      setResponse("❌ 모델 폴더를 선택하세요");
      return;
    }
    if (!isSafetensorsMode && !ggufFile.trim()) {
      setResponse("❌ GGUF 파일을 선택하세요");
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
      const r = isSafetensorsMode
        ? await invoke<string>("embed_load_normal", {
            modelPath: modelDir.trim(),
            isqType,
          })
        : loraTrimmed
          ? await invoke<string>("embed_load_lora", {
              modelDir: modelDir.trim(),
              ggufFile: ggufFile.trim(),
              loraAdapter: loraTrimmed,
            })
          : await invoke<string>("embed_load_gguf", {
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
    setResponse(null);
    const unlisten = await listen<string>("embed_token", (e) => {
      setResponse((prev) => (prev ?? "") + e.payload);
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

  const isStandardDir = candidates.some((c) => c.folder === modelDir);

  return (
    <section className="space-y-2 border border-purple-400/20 rounded-lg p-3 bg-purple-400/5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-300/90 uppercase tracking-wider">
        🧪 임베디드 추론
        <span className={`ml-auto text-[9px] font-mono truncate max-w-[220px] ${loadedKey ? "text-green-400" : "text-white/40"}`}
          title={loadedKey ?? undefined}>
          {loadedKey
            ? `● ${loadedFilename}${loadedLoraName ? ` +L:${loadedLoraName}` : ""}${isqLoaded ? ` [${isqLoaded}]` : ""}`
            : "○ 미로드"}
        </span>
      </h3>
      <p className="text-[10px] text-white/40 leading-relaxed">
        <code className="font-mono text-white/55">npm run tauri:dev:cuda</code> 빌드 전용.
        다른 모델 선택 후 로드하면 VRAM 교체(핫스왑).
      </p>

      {/* 파일 직접 선택 */}
      <button
        onClick={async () => {
          const picked = await invoke<string | null>("pick_gguf_file");
          if (!picked) return;
          const { dir, file } = parsePathComponents(picked);
          setModelDir(dir);
          setGgufFile(file);
        }}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-purple-400/30 bg-purple-500/10 hover:bg-purple-500/20 text-[11px] text-purple-200 transition-colors"
      >
        <FolderOpen size={12} /> 📂 GGUF 파일 직접 선택 (임의 경로)
      </button>

      {/* 스캔된 후보 목록 */}
      {candidates.length > 0 && (
        <>
          <div className="space-y-1">
            <span className="text-[10px] text-white/35">저장 경로 모델 ({candidates.length}개)</span>
            <Select
              value={isStandardDir ? modelDir : ""}
              onValueChange={(v) => {
                setModelDir(v);
                const c = candidates.find((x) => x.folder === v);
                setGgufFile(c?.gguf_files.length === 1 ? c.gguf_files[0] : "");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="(폴더 선택)" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.folder} value={c.folder}>{c.folder_label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fileOptions.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-white/35">GGUF 파일</span>
              <Select value={ggufFile} onValueChange={setGgufFile}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="(파일 선택)" />
                </SelectTrigger>
                <SelectContent>
                  {fileOptions.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {/* ISQ 양자화 타입 — safetensors(BF16) 모드일 때만 표시 */}
      {isSafetensorsMode && (
        <div className="space-y-1">
          <span className="text-[10px] text-white/35">ISQ 양자화 타입</span>
          <Select value={isqType} onValueChange={setIsqType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Q4K">Q4K — 권장 · ~5GB/7B</SelectItem>
              <SelectItem value="Q5K">Q5K — 균형 · ~6GB/7B</SelectItem>
              <SelectItem value="Q6K">Q6K — 고품질 · ~7GB/7B</SelectItem>
              <SelectItem value="Q8_0">Q8_0 — 최고품질 · ~8GB/7B</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-white/30">BF16 원본 → 즉석 양자화. GGUF 로드보다 수분 더 소요.</p>
        </div>
      )}

      {/* LoRA 어댑터 (선택) */}
      <div className="space-y-1">
        <span className="text-[10px] text-white/35">LoRA 어댑터 <span className="text-white/25">(선택)</span></span>
        <Select
          value={loraSelectValue}
          onValueChange={(v) => {
            if (v === LORA_NONE || v === LORA_MANUAL) setLoraPath("");
            else setLoraPath(v);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="(없음)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LORA_NONE}>(없음)</SelectItem>
            {loraCandidates.map((c) => (
              <SelectItem key={c.folder} value={c.folder}>{c.folder_label}</SelectItem>
            ))}
            <SelectItem value={LORA_MANUAL}>✏️ HF repo ID 또는 경로 직접 입력</SelectItem>
          </SelectContent>
        </Select>
        {loraSelectValue === LORA_MANUAL && (
          <Input
            value={loraPath}
            onChange={(e) => setLoraPath(e.target.value)}
            placeholder="예: username/lora-adapter 또는 C:\models\lora"
            className="font-mono text-[11px] focus:border-purple-400/40"
          />
        )}
      </div>

      {/* 직접 선택된 경로 표시 */}
      {modelDir && !isStandardDir && (
        <p className="text-[10px] font-mono text-purple-300/70 truncate" title={`${modelDir}/${ggufFile}`}>
          📂 {ggufFile || "(파일 미선택)"}
        </p>
      )}

      {candidates.length === 0 && (
        <p className="text-[10px] text-white/40">
          저장 경로에 GGUF 없음. 위 버튼으로 임의 경로 선택 또는 모델 관리 탭에서 다운로드.
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          onClick={onLoad}
          disabled={busy !== null || !modelDir.trim() || (!isSafetensorsMode && !ggufFile.trim())}
          className="flex-1 px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-[11px] text-purple-200 disabled:opacity-40 transition-colors"
        >
          {busy === "load"
            ? `🔄 로드 중... ${loadElapsed}초`
            : isSameModel
              ? "✅ 로드됨 (재로드)"
              : loadedKey
                ? `🔄 교체 (핫스왑)${loraTrimmed ? " + LoRA" : ""}`
                : `🚀 임베디드 로드${loraTrimmed ? " + LoRA" : ""}`}
        </button>
        {loadedKey && (
          <IconButton
            tooltip="VRAM에서 모델 해제"
            onClick={onUnload}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-400/20 text-[11px] text-red-300 disabled:opacity-40 transition-colors"
          >
            {busy === "unload" ? "해제 중..." : "🗑 언로드"}
          </IconButton>
        )}
      </div>
      {busy === "load" && loadStage && (
        <p className="text-[10px] font-mono text-purple-300/60 truncate">{loadStage}</p>
      )}

      <div className="space-y-1 pt-1">
        <span className="text-[10px] text-white/35">프롬프트</span>
        <Textarea
          rows={2}
          className="text-[11px] font-mono focus:border-purple-400/50"
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
          <IconButton
            tooltip="추론 중단"
            onClick={onCancelInfer}
            className="px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-400/20 text-[11px] text-red-300 transition-colors"
          >
            ⛔ 중단
          </IconButton>
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
