import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { HardwareSpecs } from "../hooks/useHardwareSpecs";
import {
  Zap, Cpu, Package, CheckCircle2, Loader2,
  ChevronRight, RefreshCw, Download, TerminalSquare, Shield, Gauge, Rocket,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface DownloadProgress {
  file: string;
  downloaded: number;
  total: number;
  done: boolean;
}

const STEPS = ["시작", "하드웨어", "성능 모드", "xLLM 서버", "AI 모델", "완료"];

type SafetyMode = "safe" | "balanced" | "max";
const MODE_META: Record<SafetyMode, { label: string; pct: number; desc: string; icon: React.ReactNode }> = {
  safe:     { label: "Safe",     pct: 70, desc: "VRAM 70% 상한 — 크래시 가능성 가장 낮음", icon: <Shield size={14} /> },
  balanced: { label: "Balanced", pct: 80, desc: "VRAM 80% 상한 — 안정성·성능 균형 (권장)", icon: <Gauge size={14} /> },
  max:      { label: "Max",      pct: 90, desc: "VRAM 90% 상한 — 최대 컨텍스트, OOM 위험",  icon: <Rocket size={14} /> },
};

interface Props {
  onComplete: () => void;
}

const OnboardingWizard: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [specs, setSpecs] = useState<HardwareSpecs | null>(null);
  const [xllmOnline, setXllmOnline] = useState<boolean | null>(null);
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [repoId, setRepoId] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [safetyMode, setSafetyMode] = useState<SafetyMode>("balanced");

  // 하드웨어 스캔
  useEffect(() => {
    if (step !== 1) return;
    invoke<HardwareSpecs>("get_hardware_specs")
      .then((s) => {
        setSpecs(s);
        setRepoId(s.recommended_model);
      })
      .catch(() => {});
  }, [step]);

  // xLLM 서버 확인 (step 3)
  useEffect(() => {
    if (step !== 3) return;
    setXllmOnline(null);
    invoke<boolean>("check_xllm_status")
      .then(setXllmOnline)
      .catch(() => setXllmOnline(false));
  }, [step]);

  // 로컬 모델 존재 여부 확인 (step 4)
  useEffect(() => {
    if (step !== 4 || !specs) return;
    setHasModel(null);
    invoke<Array<{ id: string }>>("list_local_models")
      .then((models) => {
        const base = specs.recommended_model.split("-EXL2")[0].toLowerCase();
        setHasModel(models.some((m) => m.id.toLowerCase().includes(base)));
      })
      .catch(() => setHasModel(false));
  }, [step, specs]);

  // 안전 모드 저장 (step 2 → 3 전환 시)
  const commitSafetyMode = useCallback(async (mode: SafetyMode) => {
    try { await invoke("save_safety_mode", { mode }); } catch {}
    setSafetyMode(mode);
  }, []);

  const recheckServer = useCallback(() => {
    setIsCheckingServer(true);
    invoke<boolean>("check_xllm_status")
      .then(setXllmOnline)
      .catch(() => setXllmOnline(false))
      .finally(() => setIsCheckingServer(false));
  }, []);

  const handleDownload = useCallback(async () => {
    if (!repoId.trim()) return;
    setIsDownloading(true);
    setDlProgress(null);

    const unlisten = await listen<DownloadProgress>("model_download_progress", (e) => {
      setDlProgress(e.payload);
      if (e.payload.done) setHasModel(true);
    });

    try {
      await invoke("download_model", { repoId: repoId.trim(), revision: null, hfToken: null });
    } catch {
      // 진행 이벤트로 상태 표시 — 에러는 무시하고 done 이벤트 기다림
    } finally {
      unlisten();
      setIsDownloading(false);
    }
  }, [repoId]);

  const handleComplete = useCallback(async () => {
    await invoke("complete_onboarding").catch(() => {});
    onComplete();
  }, [onComplete]);

  const next = () => setStep((s) => s + 1);

  const dlPercent =
    dlProgress && dlProgress.total > 0
      ? Math.round((dlProgress.downloaded / dlProgress.total) * 100)
      : null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg gap-0 p-0 overflow-hidden border-white/10 rounded-2xl [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">LUM 온보딩</DialogTitle>
        {/* 진행 바 */}
        <div className="flex items-center gap-1.5 px-6 pt-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? "bg-accent" : "bg-white/10"
              }`}
            />
          ))}
        </div>
        <p className="px-6 pt-2 text-[10px] text-white/25 uppercase tracking-wider">
          {STEPS[step]}
        </p>

        <div className="px-6 pb-6 pt-3 min-h-[280px] flex flex-col gap-4">
          {/* ── Step 0: 환영 ── */}
          {step === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Zap size={28} className="text-accent" />
              </div>
              <div>
                <h1 className="text-base font-bold">LUM에 오신 것을 환영합니다</h1>
                <p className="text-sm text-white/40 mt-1.5 leading-relaxed">
                  AI가 통합된 로컬 터미널입니다.<br />
                  빠른 설정을 마치면 바로 사용할 수 있습니다.
                </p>
              </div>
              <button
                onClick={next}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors text-sm font-medium"
              >
                시작하기 <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* ── Step 1: 하드웨어 ── */}
          {step === 1 && (
            <>
              <div className="flex items-center gap-2">
                <Cpu size={13} className="text-accent" />
                <span className="text-sm font-medium">하드웨어 자동 분석</span>
              </div>

              {!specs ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-white/30 text-sm">
                  <Loader2 size={13} className="animate-spin" /> 스캔 중…
                </div>
              ) : (
                <div className="space-y-3 flex-1">
                  <div className="bg-white/3 border border-white/5 rounded-xl p-4 text-sm space-y-2">
                    <Row
                      label={specs.gpu_type === "discrete" && specs.gpu_vram_gb ? "GPU VRAM" : "메모리"}
                      value={specs.gpu_type === "discrete" && specs.gpu_vram_gb
                        ? `${specs.gpu_vram_gb} GB`
                        : `${specs.total_memory_gb} GB`}
                    />
                    <Row
                      label="GPU"
                      value={
                        specs.gpu_type === "discrete" ? `외장 GPU · ${specs.gpu_name}` :
                        specs.gpu_type === "integrated" ? `내장 GPU · ${specs.gpu_name}` :
                        "CPU 추론"
                      }
                    />
                    <div className="border-t border-white/5 pt-2">
                      <Row label="추천 모델" value={specs.recommended_model} accent mono />
                    </div>
                  </div>
                  <p className="text-[11px] text-white/25 leading-relaxed">
                    {specs.recommendation_reason}
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <NextBtn onClick={next} disabled={!specs} />
              </div>
            </>
          )}

          {/* ── Step 2: 성능 모드 ── */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-2">
                <Shield size={13} className="text-accent" />
                <span className="text-sm font-medium">성능 모드 선택</span>
              </div>

              <p className="text-[12px] text-white/50 leading-relaxed">
                GPU 메모리 사용량 상한을 설정합니다. 낮을수록 안정적이지만 컨텍스트가 짧아집니다.
                언제든 설정에서 변경 가능합니다.
              </p>

              <div className="space-y-2 flex-1">
                {(Object.keys(MODE_META) as SafetyMode[]).map((m) => {
                  const meta = MODE_META[m];
                  const selected = safetyMode === m;
                  return (
                    <button
                      key={m}
                      onClick={() => commitSafetyMode(m)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                        selected
                          ? "bg-accent/10 border-accent/40"
                          : "bg-white/3 border-white/5 hover:bg-white/5"
                      }`}
                    >
                      <div className={`mt-0.5 ${selected ? "text-accent" : "text-white/40"}`}>
                        {meta.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${selected ? "text-white" : "text-white/70"}`}>
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-white/40 font-mono">{meta.pct}%</span>
                          {m === "balanced" && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
                              권장
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">
                          {meta.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <NextBtn onClick={next} disabled={false} />
              </div>
            </>
          )}

          {/* ── Step 3: xLLM 서버 ── */}
          {step === 3 && (
            <>
              <div className="flex items-center gap-2">
                <TerminalSquare size={13} className="text-accent" />
                <span className="text-sm font-medium">xLLM 서버 확인</span>
              </div>

              <div className="flex items-center gap-2">
                {xllmOnline === null
                  ? <Loader2 size={12} className="animate-spin text-white/30" />
                  : xllmOnline
                    ? <CheckCircle2 size={12} className="text-green-400" />
                    : <span className="w-3 h-3 rounded-full bg-red-400/80 shrink-0" />
                }
                <span className={`text-sm ${
                  xllmOnline === null ? "text-white/30" :
                  xllmOnline ? "text-green-400" : "text-red-400"
                }`}>
                  {xllmOnline === null ? "확인 중…" : xllmOnline ? "TabbyAPI 연결됨" : "TabbyAPI 미연결"}
                </span>
                <button
                  onClick={recheckServer}
                  className="ml-auto text-white/25 hover:text-white/60 transition-colors"
                  title="재확인"
                >
                  {isCheckingServer
                    ? <Loader2 size={11} className="animate-spin" />
                    : <RefreshCw size={11} />}
                </button>
              </div>

              {xllmOnline === false && (
                <div className="bg-white/2 border border-white/5 rounded-xl p-4 space-y-3 text-[11px]">
                  <p className="text-white/50 font-medium">TabbyAPI 설치 및 실행</p>
                  <CodeBlock>pip install tabbyapi</CodeBlock>
                  <CodeBlock>tabbyapi --model-dir ~/tabby/models --port 5000</CodeBlock>
                  <a
                    href="https://github.com/theroyallab/tabbyAPI"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-accent hover:text-accent/70 transition-colors mt-1"
                  >
                    TabbyAPI 공식 문서 →
                  </a>
                </div>
              )}

              <div className="flex justify-between mt-auto">
                <SkipBtn onClick={next} />
                <NextBtn onClick={next} />
              </div>
            </>
          )}

          {/* ── Step 4: 모델 준비 ── */}
          {step === 4 && (
            <>
              <div className="flex items-center gap-2">
                <Package size={13} className="text-accent" />
                <span className="text-sm font-medium">AI 모델 준비</span>
              </div>

              {hasModel === null ? (
                <div className="flex items-center gap-2 text-sm text-white/30">
                  <Loader2 size={12} className="animate-spin" /> 설치 여부 확인 중…
                </div>
              ) : hasModel ? (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 size={13} /> 모델이 이미 설치되어 있습니다
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-[10px] text-white/30">HuggingFace 레포지토리 ID</p>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-[12px] font-mono outline-none focus:border-accent/50 transition-colors"
                      placeholder="author/model-name"
                      value={repoId}
                      onChange={(e) => setRepoId(e.target.value)}
                      disabled={isDownloading}
                    />
                  </div>

                  {!isDownloading && !dlProgress && (
                    <button
                      onClick={handleDownload}
                      disabled={!repoId.trim()}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 transition-colors text-sm"
                    >
                      <Download size={12} /> HuggingFace에서 다운로드
                    </button>
                  )}

                  {isDownloading && dlProgress && (
                    <div className="space-y-1.5">
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-200"
                          style={{ width: `${dlPercent ?? 0}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-white/40 font-mono truncate">
                        {dlProgress.file} {dlPercent !== null ? `${dlPercent}%` : ""}
                        {dlProgress.total > 0 &&
                          ` · ${(dlProgress.downloaded / 1024 / 1024).toFixed(0)} / ${(dlProgress.total / 1024 / 1024).toFixed(0)} MB`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between mt-auto">
                <SkipBtn onClick={next} label="나중에 설치" />
                <NextBtn onClick={next} disabled={isDownloading} />
              </div>
            </>
          )}

          {/* ── Step 5: 완료 ── */}
          {step === 5 && (
            <div className="flex flex-col items-center justify-center flex-1 text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-green-400/10 border border-green-400/20 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-green-400" />
              </div>
              <div>
                <h1 className="text-base font-bold">설정 완료!</h1>
                <p className="text-sm text-white/40 mt-1.5 leading-relaxed">
                  LUM이 준비됐습니다.<br />
                  <span className="font-mono text-white/60">Cmd+K</span> — AI 바&nbsp;&nbsp;
                  <span className="font-mono text-white/60">#</span> — 자연어 명령 변환
                </p>
              </div>
              <button
                onClick={handleComplete}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors text-sm font-medium"
              >
                <TerminalSquare size={14} /> 터미널 시작하기
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── 재사용 서브 컴포넌트 ──────────────────────────────────────────────────────

const Row: React.FC<{
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}> = ({ label, value, accent, mono }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-white/40 shrink-0">{label}</span>
    <span className={`truncate text-right ${mono ? "font-mono text-[11px]" : ""} ${accent ? "text-accent" : ""}`}>
      {value}
    </span>
  </div>
);

const CodeBlock: React.FC<{ children: string }> = ({ children }) => (
  <pre className="bg-black/40 rounded px-3 py-1.5 font-mono text-white/70 text-[11px] select-all whitespace-pre-wrap">
    {children}
  </pre>
);

const NextBtn: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 transition-colors text-sm"
  >
    다음 <ChevronRight size={13} />
  </button>
);

const SkipBtn: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = "나중에 설정" }) => (
  <button
    onClick={onClick}
    className="text-xs text-white/25 hover:text-white/50 transition-colors"
  >
    {label}
  </button>
);

export default OnboardingWizard;
