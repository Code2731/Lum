// Phase 119 — LoRA Forge 패널.
// Phase 117(수집) → 118(검색) → 119(학습): 사용자 healing 데이터셋으로 본인 모델을 직접 fine-tune.
// 클라우드 제품은 데이터 보관정책상 못 함 — LUM의 가장 강한 모트.

import React, { useEffect, useMemo, useState } from "react";
import {
  Hammer, Play, Loader2, Trash2, FolderOpen, Copy, X as XIcon, CheckCircle2, XCircle, Clock,
  AlertTriangle, Zap, Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLoraForge, type ForgeRun, type ForgeStatus, type AutoEvent } from "../hooks/useLoraForge";
import { fmtShortDate } from "../utils";
import { cn } from "@/lib/utils";
import { SMALL_ICON_SIZE } from "../constants/ui";

interface Props {
  onLoadAdapter?: (run: ForgeRun) => void;
  onRevealPath?: (path: string) => void;
  onClose: () => void;
}

const STATUS_META: Record<ForgeStatus, { label: string; tone: string; icon: React.ReactNode }> = {
  running: { label: "실행 중", tone: "text-blue-300 bg-blue-400/10 border-blue-400/25", icon: <Loader2 size={11} className="animate-spin" /> },
  completed: { label: "완료", tone: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25", icon: <CheckCircle2 size={11} /> },
  failed: { label: "실패", tone: "text-rose-300 bg-rose-400/10 border-rose-400/25", icon: <XCircle size={11} /> },
  cancelled: { label: "취소됨", tone: "text-white/45 bg-white/5 border-white/15", icon: <XIcon size={11} /> },
};

const DEFAULTS = {
  task: "",
  // mlx_lm은 HF id를 자동 다운로드. 사용자가 자기 환경에 맞춰 변경.
  baseModel: "mlx-community/Qwen2.5-Coder-7B-Instruct-bf16",
  iters: 200,
  loraRank: 8,
  learningRate: 1e-5,
};

const LoraForgePanel: React.FC<Props> = ({ onLoadAdapter, onRevealPath, onClose }) => {
  const {
    runs, runtimes, autoStatus, autoEvents, liveLogs, error,
    start, cancel, remove, canLoad, saveAutoSettings, dismissAutoEvent,
  } = useLoraForge();

  const [task, setTask] = useState(DEFAULTS.task);
  const [runtime, setRuntime] = useState<"mlx-lm" | "axolotl">("mlx-lm");
  const [baseModel, setBaseModel] = useState(DEFAULTS.baseModel);
  const [iters, setIters] = useState(DEFAULTS.iters);
  const [loraRank, setLoraRank] = useState(DEFAULTS.loraRank);
  const [learningRate, setLearningRate] = useState(DEFAULTS.learningRate);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 어떤 run을 펼쳐서 라이브 로그를 보여줄지.
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [loadableMap, setLoadableMap] = useState<Record<string, boolean>>({});

  const runtimeAvailable = useMemo(() => {
    if (!runtimes) return false;
    return runtime === "mlx-lm" ? runtimes.mlx_lm : runtimes.axolotl;
  }, [runtimes, runtime]);

  const handleSubmit = async () => {
    if (!task.trim() || !baseModel.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const run = await start({
        task: task.trim(),
        runtime,
        baseModel: baseModel.trim(),
        iters,
        loraRank,
        learningRate,
      });
      setOpenRunId(run.id);
      setTask("");
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const checkLoadable = async (run: ForgeRun) => {
    if (run.status !== "completed") return;
    if (run.id in loadableMap) return;
    const ok = await canLoad(run.id);
    setLoadableMap((prev) => ({ ...prev, [run.id]: ok }));
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="lum-sidepanel sm:max-w-[760px] max-h-[86vh] flex flex-col gap-0 p-0 overflow-hidden border-white/12 rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10 bg-white/[0.02] shrink-0">
          <Hammer size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">LoRA Forge</DialogTitle>
          <span className="text-xs text-white/35 ml-1">healing 데이터셋으로 내 모델 학습</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded border border-white/[0.1] text-white/40 hover:text-white/75 hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="닫기"
          >
            <XIcon size={12} />
          </button>
        </div>

        {runtimes && (
          <div
            className={cn(
              "px-5 py-2 border-b shrink-0 text-sm flex items-center gap-2",
              runtimes.mlx_lm || runtimes.axolotl
                ? "bg-emerald-500/5 border-emerald-400/15 text-emerald-200"
                : "bg-amber-500/5 border-amber-400/20 text-amber-200",
            )}
          >
            {runtimes.mlx_lm || runtimes.axolotl ? (
              <CheckCircle2 size={12} />
            ) : (
              <AlertTriangle size={12} />
            )}
            <span>{runtimes.hint}</span>
            <span className="ml-auto text-xs text-white/40">
              mlx-lm {runtimes.mlx_lm ? "✓" : "✗"} · axolotl {runtimes.axolotl ? "✓" : "✗"}
            </span>
          </div>
        )}

        {/* Phase 120 — 자동 학습 설정 카드 */}
        <AutoTrainCard
          autoStatus={autoStatus}
          autoEvents={autoEvents}
          defaultBaseModel={DEFAULTS.baseModel}
          onSave={saveAutoSettings}
          onDismissEvent={dismissAutoEvent}
        />

        {/* 학습 시작 폼 */}
        <div className="px-5 py-3.5 border-b border-white/10 bg-white/[0.015] shrink-0 space-y-2.5">
          <div className="space-y-1">
            <Label htmlFor="forge-task" className="text-xs text-white/55">작업 이름</Label>
            <Input
              id="forge-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="예: docker 빌드 실패 패턴 학습"
              disabled={submitting}
              className="h-8 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-white/55">런타임</Label>
              <div className="flex gap-1">
                {(["mlx-lm", "axolotl"] as const).map((rt) => {
                  const have = rt === "mlx-lm" ? runtimes?.mlx_lm : runtimes?.axolotl;
                  const active = runtime === rt;
                  return (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setRuntime(rt)}
                      aria-pressed={active}
                      className={cn(
                        "flex-1 h-8 rounded-md text-sm border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        active
                          ? "text-accent bg-accent/10 border-accent/30"
                          : "text-white/55 border-white/10 hover:text-white/85 hover:border-white/20",
                      )}
                      title={have ? `${rt} 사용 가능` : `${rt} 미설치`}
                    >
                      {rt} {have ? "✓" : "·"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="forge-base" className="text-xs text-white/55">베이스 모델 (HF id 또는 로컬 경로)</Label>
              <Input
                id="forge-base"
                value={baseModel}
                onChange={(e) => setBaseModel(e.target.value)}
                disabled={submitting}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="forge-iters" className="text-xs text-white/55">iters (1–10000)</Label>
              <Input
                id="forge-iters"
                type="number"
                value={iters}
                onChange={(e) => setIters(Math.max(1, Math.min(10000, Number(e.target.value) || 0)))}
                min={1}
                max={10000}
                disabled={submitting}
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="forge-rank" className="text-xs text-white/55">lora rank (2–64)</Label>
              <Input
                id="forge-rank"
                type="number"
                value={loraRank}
                onChange={(e) => setLoraRank(Math.max(2, Math.min(64, Number(e.target.value) || 0)))}
                min={2}
                max={64}
                disabled={submitting}
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="forge-lr" className="text-xs text-white/55">learning rate</Label>
              <Input
                id="forge-lr"
                type="number"
                step="1e-6"
                value={learningRate}
                onChange={(e) => setLearningRate(Number(e.target.value) || 0)}
                min={1e-7}
                max={0.999}
                disabled={submitting}
                className="h-8 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-0.5">
            <p className="text-xs text-white/35 flex-1">
              데이터셋 미지정 시 healing chatml export(승인된 결정만)를 자동 생성하여 학습.
            </p>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !task.trim() || !baseModel.trim() || !runtimeAvailable}
                  size="sm"
                  className="h-8 gap-1.5 border border-accent/35 bg-accent/20 hover:bg-accent/30"
                  title={!runtimeAvailable ? "선택한 런타임이 설치되어 있지 않습니다" : undefined}
                >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {submitting ? "시작 중…" : "Forge"}
            </Button>
          </div>

          {submitError && (
            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded px-2 py-1.5">
              {submitError}
            </p>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 text-sm text-rose-300 bg-rose-500/10 border-b border-rose-400/20 shrink-0">
            {error}
          </div>
        )}

        {/* 과거 + 현재 run 리스트 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0 space-y-1.5">
          {runs.length === 0 && (
            <div className="text-center py-12 text-xs text-white/35 space-y-1.5">
              <Hammer size={20} className="mx-auto text-white/20" />
              <p>아직 학습 실행 기록이 없습니다.</p>
              <p className="text-xs text-white/25">위 폼에서 task를 입력하고 Forge를 누르면 시작합니다.</p>
            </div>
          )}
          {runs.map((r) => (
            <RunRow
              key={r.id}
              run={r}
              isOpen={openRunId === r.id}
              liveLog={liveLogs[r.id] ?? []}
              loadable={loadableMap[r.id]}
              onToggle={() => {
                const next = openRunId === r.id ? null : r.id;
                setOpenRunId(next);
                if (next === r.id) checkLoadable(r);
              }}
              onCancel={() => cancel(r.id)}
              onRemove={() => remove(r.id)}
              onLoad={onLoadAdapter ? () => onLoadAdapter(r) : undefined}
              onReveal={onRevealPath ? () => onRevealPath(r.output_dir) : undefined}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const RunRow: React.FC<{
  run: ForgeRun;
  isOpen: boolean;
  liveLog: string[];
  loadable: boolean | undefined;
  onToggle: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onLoad?: () => void;
  onReveal?: () => void;
}> = ({ run, isOpen, liveLog, loadable, onToggle, onCancel, onRemove, onLoad, onReveal }) => {
  const meta = STATUS_META[run.status];
  const showLive = isOpen && run.status === "running";
  // 진행 중이면 라이브 로그, 완료 후엔 영속된 log_tail.
  const lines = showLive ? liveLog : run.log_tail;
  const duration = run.ts_ended_ms ? run.ts_ended_ms - run.ts_started_ms : null;

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.1] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs hover:bg-white/[0.06] text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={cn("inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border shrink-0", meta.tone)}>
          {meta.icon}
          {meta.label}
        </span>
        {run.auto && (
          <span
            className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border shrink-0 text-cyan-300 bg-cyan-400/10 border-cyan-400/25"
            title="approve 누적으로 자동 트리거된 학습"
          >
            <Zap size={10} />
            auto
          </span>
        )}
        <span className="truncate flex-1 text-white/85 font-medium">{run.task}</span>
        <span className="text-xs text-white/45 font-mono shrink-0">{run.runtime}</span>
        <span className="text-xs text-white/45 tabular-nums shrink-0">
          {run.iters} iters · r{run.lora_rank}
        </span>
        <span className="text-xs text-white/30 tabular-nums shrink-0 inline-flex items-center gap-0.5">
          <Clock size={9} />
          {fmtShortDate(run.ts_started_ms, "ms")}
        </span>
      </button>

      {isOpen && (
        <div className="px-3 pb-2.5 pt-0.5 space-y-1.5 text-sm border-t border-white/[0.08]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-white/55">
            <span>모델: <span className="font-mono text-white/75">{run.base_model}</span></span>
            <span>lr: <span className="tabular-nums">{run.learning_rate}</span></span>
            <span className="col-span-2 truncate" title={run.dataset_path}>데이터: <span className="font-mono text-white/65">{run.dataset_path}</span></span>
            <span className="col-span-2 truncate" title={run.output_dir}>출력: <span className="font-mono text-white/65">{run.output_dir}</span></span>
            {duration !== null && (
              <span>소요: <span className="tabular-nums">{(duration / 1000).toFixed(1)}s</span></span>
            )}
            {run.exit_code !== null && (
              <span>exit: <span className="tabular-nums">{run.exit_code}</span></span>
            )}
          </div>

          <pre className="text-white/72 font-mono whitespace-pre-wrap text-xs bg-black/28 border border-white/[0.08] rounded-md px-2 py-1.5 max-h-44 overflow-y-auto">
            {lines.length === 0 ? <span className="text-white/30">(로그 없음)</span> : lines.join("\n")}
          </pre>

          <div className="flex items-center gap-2 pt-0.5 flex-wrap">
            {run.status === "running" ? (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <XIcon size={10} /> 취소
              </button>
            ) : (
              run.status === "completed" && onLoad && (
                <button
                  type="button"
                  onClick={onLoad}
                  disabled={loadable === false}
                  title={
                    loadable === false
                      ? "이 run의 출력에 adapter_config.json이 없어 mistralrs LoRA 로더와 호환되지 않습니다 (mlx-lm 어댑터는 별도 변환 필요)"
                      : "현재 추론 모델에 LoRA 어댑터로 로드"
                  }
                  className={cn(
                    "inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    loadable === false
                      ? "text-white/25 cursor-not-allowed"
                      : "text-accent hover:text-accent/80",
                  )}
                >
                  추론에 로드
                </button>
              )
            )}
            {onReveal && (
              <button
                type="button"
                onClick={onReveal}
                className="inline-flex items-center gap-1 text-xs text-white/45 hover:text-white/80 rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <FolderOpen size={10} /> 출력 폴더
              </button>
            )}
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(run.output_dir)}
              className="inline-flex items-center gap-1 text-xs text-white/45 hover:text-white/80 rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Copy size={10} /> 경로 복사
            </button>
            <ConfirmDeleteDialog
              itemName={run.task}
              itemType="LoRA run"
              description={`출력 디렉터리(${run.output_dir})까지 함께 삭제됩니다. 진행 중이면 학습이 취소됩니다.`}
              onConfirm={onRemove}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-rose-300 rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Trash2 size={10} /> 삭제
              </button>
            </ConfirmDeleteDialog>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Phase 120: 자동 학습 설정 카드 ──────────────────────────────────────

const AUTO_PHASE_TONE: Record<AutoEvent["phase"], string> = {
  starting: "text-cyan-200 bg-cyan-500/10 border-cyan-400/25",
  spawned: "text-cyan-200 bg-cyan-500/10 border-cyan-400/25",
  hot_swapped: "text-emerald-200 bg-emerald-500/10 border-emerald-400/25",
  hot_swap_failed: "text-rose-200 bg-rose-500/10 border-rose-400/25",
  error: "text-rose-200 bg-rose-500/10 border-rose-400/25",
  skipped: "text-amber-200 bg-amber-500/10 border-amber-400/25",
};

const AUTO_PHASE_LABEL: Record<AutoEvent["phase"], string> = {
  starting: "자동 학습 트리거",
  spawned: "프로세스 시작",
  hot_swapped: "어댑터 hot-swap 완료",
  hot_swap_failed: "hot-swap 실패",
  error: "자동 학습 오류",
  skipped: "건너뜀",
};

interface AutoCardProps {
  autoStatus: ReturnType<typeof useLoraForge>["autoStatus"];
  autoEvents: AutoEvent[];
  defaultBaseModel: string;
  onSave: (s: Parameters<ReturnType<typeof useLoraForge>["saveAutoSettings"]>[0]) => Promise<void>;
  onDismissEvent: (tsMs: number) => void;
}

const AutoTrainCard: React.FC<AutoCardProps> = ({
  autoStatus,
  autoEvents,
  defaultBaseModel,
  onSave,
  onDismissEvent,
}) => {
  // Local form state — 첫 로드 시 백엔드 값 반영, 이후 사용자 편집은 onBlur/Switch 토글에서 저장.
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(25);
  const [autoLoad, setAutoLoad] = useState(true);
  const [baseModel, setBaseModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 백엔드 status가 처음 로드되면 form 동기화 (한 번).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated && autoStatus) {
      setEnabled(autoStatus.enabled);
      setThreshold(autoStatus.threshold);
      setHydrated(true);
    }
  }, [autoStatus, hydrated]);

  const persist = async (patch: Parameters<typeof onSave>[0]) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(patch);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const recentEvents = useMemo(() => {
    return [...autoEvents].sort((a, b) => b.ts_ms - a.ts_ms).slice(0, 3);
  }, [autoEvents]);

  return (
    <div className="px-5 py-3 border-b border-white/10 shrink-0 bg-cyan-500/[0.03] space-y-2.5">
      <div className="flex items-center gap-2">
        <Sparkles size={SMALL_ICON_SIZE} className="text-cyan-300" />
        <span className="text-xs font-semibold text-white/85">자동 학습 루프</span>
        <span className="text-xs text-white/40">approve 누적 시 백그라운드 학습</span>
        <span className="ml-auto" />
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            persist({ enabled: v });
          }}
          aria-label="자동 학습 활성화"
        />
      </div>

      {autoStatus && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm text-white/55">
          <span>
            미학습 approve:{" "}
            <span className="tabular-nums font-semibold text-white/85">
              {autoStatus.unlearned_count}
            </span>
            {" / "}
            <span className="tabular-nums">{autoStatus.threshold}</span>
          </span>
          <span>
            상태:{" "}
            {autoStatus.running ? (
              <span className="text-blue-300 inline-flex items-center gap-1">
                <Loader2 size={9} className="animate-spin" /> 학습 진행 중
              </span>
            ) : autoStatus.blocked_reason ? (
              <span className="text-amber-200" title={autoStatus.blocked_reason}>
                대기 — {autoStatus.blocked_reason}
              </span>
            ) : (
              <span className="text-emerald-300">트리거 준비됨</span>
            )}
          </span>
          <span className="col-span-2 text-xs text-white/35">
            cursor: {autoStatus.cursor_ms > 0 ? fmtShortDate(autoStatus.cursor_ms, "ms") : "(아직 학습 이력 없음)"}
          </span>
        </div>
      )}

      {enabled && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor="auto-threshold" className="text-xs text-white/55">
              threshold
            </Label>
            <Input
              id="auto-threshold"
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Math.max(1, Math.min(10000, Number(e.target.value) || 0)))}
              onBlur={() => persist({ threshold })}
              min={1}
              max={10000}
              className="h-8 text-xs tabular-nums"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="auto-base" className="text-xs text-white/55">
              자동 학습 베이스 모델 (필수)
            </Label>
            <Input
              id="auto-base"
              value={baseModel}
              onChange={(e) => setBaseModel(e.target.value)}
              onBlur={() => persist({ baseModel: baseModel.trim() ? baseModel.trim() : null })}
              placeholder={defaultBaseModel}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="col-span-3 flex items-center gap-2">
            <Switch
              id="auto-load"
              checked={autoLoad}
              onCheckedChange={(v) => {
                setAutoLoad(v);
                persist({ autoLoad: v });
              }}
            />
            <Label htmlFor="auto-load" className="text-sm text-white/65 cursor-pointer">
              학습 완료 시 호환 어댑터를 즉시 hot-swap (mistralrs 호환 형식만)
            </Label>
          </div>
        </div>
      )}

      {saving && <p className="text-xs text-white/35">저장 중…</p>}
      {saveError && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded px-2 py-1">{saveError}</p>}

      {recentEvents.length > 0 && (
        <div className="space-y-1 pt-0.5">
          {recentEvents.map((ev) => (
            <div
              key={ev.ts_ms}
              className={cn(
                "flex items-center gap-2 text-xs px-2 py-1 rounded border",
                AUTO_PHASE_TONE[ev.phase],
              )}
            >
              <span className="font-medium shrink-0">{AUTO_PHASE_LABEL[ev.phase]}</span>
              <span className="truncate flex-1">
                {ev.message || ev.error || ev.reason ||
                  (ev.unlearned_count !== undefined ? `미학습 ${ev.unlearned_count}건` : "")}
              </span>
              <span className="tabular-nums text-white/40 shrink-0">{fmtShortDate(ev.ts_ms, "ms")}</span>
              <button
                type="button"
                onClick={() => onDismissEvent(ev.ts_ms)}
                aria-label="이벤트 닫기"
                className="opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
              >
                <XIcon size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LoraForgePanel;
