import React, { useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Square,
  X,
  Brain,
  Zap,
  Eye,
  Terminal,
  FilePlus,
  FileEdit,
  FileX,
  Undo2,
} from "lucide-react";
import type {
  ReactAgentState,
  ReactStep,
  ChangeInfo,
  ChangeRisk,
  ChangeKind,
} from "../hooks/useReactAgent";
import { SMALL_ICON_SIZE } from "../constants/ui";

interface ScipBackend {
  language: string;
  key: string;
  binary: string;
  available: boolean;
  index_path: string;
  index_exists: boolean;
}

interface ScipStatus {
  enabled: boolean;
  backends: ScipBackend[];
}

interface ScipRebuildResult {
  language: string;
  binary: string;
  available: boolean;
  index_path: string;
  requested: boolean;
  skipped: boolean;
  success: boolean;
  timed_out: boolean;
  message: string;
}

interface ScipRebuildSummary {
  requested_language: string | null;
  force: boolean;
  results: ScipRebuildResult[];
}

interface Props {
  state: ReactAgentState;
  onCancel: () => void;
  onClose: () => void;
  onUndo: () => void;
  onRunAct: (toolWhitelist: string[] | null) => void;
}

const KIND_ICON: Record<ReactStep["kind"], React.ReactNode> = {
  thought: <Brain size={10} className="text-purple-400 shrink-0 mt-0.5" />,
  action: <Zap size={10} className="text-yellow-400 shrink-0 mt-0.5" />,
  observation: <Eye size={10} className="text-blue-400 shrink-0 mt-0.5" />,
  answer: <CheckCircle2 size={10} className="text-green-400 shrink-0 mt-0.5" />,
  error: <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />,
  status: <Terminal size={10} className="text-white/30 shrink-0 mt-0.5" />,
  // file_change는 단계 목록엔 직접 표시 안 함 — 변경 파일 섹션에서 종합 표시.
  file_change: <FileEdit size={10} className="text-cyan-400 shrink-0 mt-0.5" />,
};

const KIND_COLOR: Record<ReactStep["kind"], string> = {
  thought: "text-purple-300/80",
  action: "text-yellow-300/80",
  observation: "text-blue-300/70",
  answer: "text-green-300",
  error: "text-red-400",
  status: "text-white/30",
  file_change: "text-cyan-300/80",
};

const RISK_BADGE: Record<
  ChangeRisk,
  { label: string; bg: string; fg: string; border: string }
> = {
  low: {
    label: "낮음",
    bg: "bg-green-500/10",
    fg: "text-green-300",
    border: "border-green-500/20",
  },
  medium: {
    label: "보통",
    bg: "bg-yellow-500/10",
    fg: "text-yellow-300",
    border: "border-yellow-500/20",
  },
  high: {
    label: "높음",
    bg: "bg-red-500/10",
    fg: "text-red-300",
    border: "border-red-500/20",
  },
};

const KIND_ICON_FILE: Record<ChangeKind, React.ReactNode> = {
  created: <FilePlus size={11} className="text-green-400 shrink-0" />,
  modified: <FileEdit size={11} className="text-cyan-400 shrink-0" />,
  deleted: <FileX size={11} className="text-red-400 shrink-0" />,
};

const KIND_LABEL_FILE: Record<ChangeKind, string> = {
  created: "신규",
  modified: "수정",
  deleted: "삭제",
};

const StepRow: React.FC<{ step: ReactStep; idx: number }> = ({ step }) => {
  // file_change는 단계 목록에서 숨김 — 변경 파일 섹션에서 종합 표시.
  if (step.kind === "file_change") {
    return null;
  }
  if (step.kind === "status") {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1">
        {KIND_ICON[step.kind]}
        <span className="text-xs text-white/25 font-mono">
          {step.content}
        </span>
      </div>
    );
  }
  return (
    <div
      className={`flex items-start gap-1.5 py-1 px-1 rounded ${
        step.kind === "observation"
          ? "bg-white/2"
          : step.kind === "answer"
            ? "bg-green-500/5 border border-green-500/10"
            : ""
      }`}
    >
      {KIND_ICON[step.kind]}
      <div className="flex-1 min-w-0">
        {step.kind === "action" && step.tool && (
          <span className="text-xs font-mono text-yellow-500/60 mr-1">
            [{step.tool}]
          </span>
        )}
        <span
          className={`text-sm leading-relaxed ${KIND_COLOR[step.kind]} ${
            step.kind === "observation" || step.kind === "action"
              ? "font-mono"
              : ""
          }`}
        >
          {step.content}
        </span>
      </div>
    </div>
  );
};

const ChangeRow: React.FC<{ change: ChangeInfo }> = ({ change }) => {
  const risk = RISK_BADGE[change.risk];
  return (
    <div className="flex items-center gap-2 py-1 px-1.5 rounded bg-white/2 hover:bg-white/4 transition-colors">
      {KIND_ICON_FILE[change.kind]}
      <span className="text-xs text-white/40 font-medium shrink-0 w-7">
        {KIND_LABEL_FILE[change.kind]}
      </span>
      <span
        className={`text-xs font-mono px-1.5 py-0.5 rounded border ${risk.bg} ${risk.fg} ${risk.border} shrink-0`}
        title={
          change.risk === "high"
            ? "빌드/설정 파일 변경 — 신중 검토 필요"
            : change.risk === "low"
              ? "테스트 파일 변경 — 빠른 확인"
              : "일반 소스 변경 — 검토 권장"
        }
      >
        {risk.label}
      </span>
      <span
        className="text-sm font-mono text-white/70 truncate flex-1 min-w-0"
        title={change.path}
      >
        {change.rel_path}
      </span>
    </div>
  );
};

const STATUS_LABEL: Record<ReactAgentState["status"], string> = {
  idle: "대기",
  running: "실행 중...",
  done: "완료",
  error: "오류",
  cancelled: "취소됨",
};

const ReactAgentPanel: React.FC<Props> = ({
  state,
  onCancel,
  onClose,
  onUndo,
  onRunAct,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [desktopToolsEnabled, setDesktopToolsEnabled] = React.useState(false);
  const [scipToolsEnabled, setScipToolsEnabled] = React.useState(false);
  const [scipStatus, setScipStatus] = React.useState<ScipStatus | null>(null);
  const [isScipRebuildInProgress, setIsScipRebuildInProgress] =
    React.useState(false);
  const [scipRebuildForce, setScipRebuildForce] = React.useState(false);
  const [scipRebuildMessage, setScipRebuildMessage] = React.useState("");
  const [scipRebuildTargetLanguage, setScipRebuildTargetLanguage] =
    React.useState<string>("all");
  const { status, goal, steps, changes, undoing, undoReport } = state;
  const isActive = status === "running";
  const isPlanDone = status === "done" && state.mode === "plan";
  const currentStep = steps.filter((s) => s.kind === "status").length;
  const hasChanges = changes.length > 0;
  const highRiskCount = changes.filter((c) => c.risk === "high").length;
  const availableScipBackends =
    scipStatus?.backends.filter((backend) => backend.available).length ?? 0;
  const indexedScipBackends =
    scipStatus?.backends.filter(
      (backend) => backend.available && backend.index_exists,
    ).length ?? 0;
  const scipStatusLines =
    scipStatus?.backends
      .filter((backend) => backend.available)
      .map((backend) =>
        backend.index_exists
          ? `${backend.language}: index.scip 존재`
          : `${backend.language}: index.scip 없음`,
      )
      .join(" · ") ??
    "SCIP 백엔드 상태 없음";
  const isScipEnabled =
    scipToolsEnabled && availableScipBackends > 0 && scipStatus?.enabled;
  const hasScipMissingIndex =
    scipStatus?.backends.some(
      (backend) => backend.available && !backend.index_exists,
    ) ?? false;
  const scipAvailableTargets = scipStatus?.backends
    .filter((backend) => backend.available)
    .map((backend) => ({
      language: backend.language,
      value: backend.key,
    }));
  const scipRebuildTargetAll = scipRebuildTargetLanguage === "all";
  const scipRebuildTargetLanguageLabel = scipRebuildTargetAll
    ? "전체"
    : scipAvailableTargets?.find(
        (entry) => entry.value === scipRebuildTargetLanguage,
      )?.language ?? scipRebuildTargetLanguage;
  const scipRebuildTargetMissing = scipRebuildTargetAll
    ? hasScipMissingIndex
    : !!scipStatus?.backends.find(
        (backend) =>
          backend.key === scipRebuildTargetLanguage &&
          !backend.index_exists,
      );
  const scipRebuildTargetInvalid = React.useMemo(
    () =>
      scipRebuildTargetLanguage !== "all" &&
      !scipAvailableTargets?.some(
        (entry) => entry.value === scipRebuildTargetLanguage,
      ),
    [scipRebuildTargetLanguage, scipAvailableTargets],
  );
  const scipRebuildDisabled =
    isScipRebuildInProgress ||
    !state.cwd ||
    availableScipBackends === 0 ||
    !scipStatus ||
    scipRebuildTargetInvalid;
  const showUndoButton =
    hasChanges &&
    (status === "done" || status === "error" || status === "cancelled");

  // 새 단계 추가 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  // ReAct 데스크톱 제어 도구는 opt-in 기본값(false). 패널 열 때 현재 설정 동기화.
  useEffect(() => {
    const refreshScipStatus = async () => {
      try {
        const refreshed = state.cwd
          ? await invoke<ScipStatus>("scip_status", { cwd: state.cwd })
          : await invoke<ScipStatus>("scip_status");
        setScipStatus(refreshed);
      } catch {
        // 조회 실패해도 기존 상태 유지 — 표시 신뢰도보다 토글 우선.
      }
    };

    invoke<{ react_desktop_tools_enabled?: boolean }>("load_app_config")
      .then((cfg) =>
        setDesktopToolsEnabled(Boolean(cfg.react_desktop_tools_enabled)),
      )
      .catch(() => {});
    invoke<{ react_scip_tools_enabled?: boolean }>("load_app_config")
      .then((cfg) => {
        setScipToolsEnabled(Boolean(cfg.react_scip_tools_enabled));
      })
      .catch(() => {});
    refreshScipStatus();
  }, [state.cwd]);

  useEffect(() => {
    if (!scipRebuildTargetAll && scipRebuildTargetInvalid) {
      setScipRebuildTargetLanguage("all");
    }
  }, [scipRebuildTargetAll, scipRebuildTargetInvalid]);

  const toggleDesktopTools = async () => {
    const next = !desktopToolsEnabled;
    setDesktopToolsEnabled(next);
    try {
      await invoke("save_react_desktop_tools_enabled", { enabled: next });
    } catch {
      // 저장 실패면 UI 롤백 — 실제 설정과 표시 불일치 방지.
      setDesktopToolsEnabled(!next);
    }
  };

  const toggleScipTools = async () => {
    if (!scipStatus) {
      return;
    }

    const next = !scipToolsEnabled;
    setScipToolsEnabled(next);
    try {
      await invoke("save_react_scip_tools_enabled", { enabled: next });
      const refreshed = state.cwd
        ? await invoke<ScipStatus>("scip_status", { cwd: state.cwd })
        : await invoke<ScipStatus>("scip_status");
      setScipStatus(refreshed);
      if (next && !refreshed.enabled) {
        setScipToolsEnabled(false);
      }
    } catch {
      setScipToolsEnabled(!next);
    }
  };

  const runScipRebuild = async () => {
    if (!state.cwd || !scipStatus) {
      return;
    }
    setIsScipRebuildInProgress(true);
    const requestLanguage = scipRebuildTargetAll ? null : scipRebuildTargetLanguage;
    setScipRebuildMessage(`${scipRebuildTargetLanguageLabel} SCIP 인덱스를 생성합니다...`);
    try {
      const summary = await invoke<ScipRebuildSummary>("scip_rebuild_index", {
        cwd: state.cwd,
        language: requestLanguage,
        force: scipRebuildForce,
      });
      const lines = summary.results.map((result) => {
        const stateLabel = result.success
          ? result.skipped
            ? "생략"
            : "성공"
          : "실패";
        return `[${stateLabel}] ${result.language}: ${result.message}`;
      });
      const updatedStatus = await invoke<ScipStatus>("scip_status", { cwd: state.cwd });
      setScipStatus(updatedStatus);
      setScipRebuildMessage(lines.join(" · "));
    } catch {
      setScipRebuildMessage("SCIP 인덱스 생성에 실패했습니다.");
    } finally {
      setIsScipRebuildInProgress(false);
    }
  };

  return (
    <div className="w-[540px] max-h-[80vh] flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-white/3 shrink-0">
        <Bot size={SMALL_ICON_SIZE} className="text-accent shrink-0" />
        <span className="text-sm font-semibold text-accent">
          ReAct 에이전트
        </span>
        <span className="text-xs text-white/30 ml-1 truncate flex-1">
          {goal}
        </span>
        <button
          onClick={onClose}
          className="ml-auto text-white/30 hover:text-white/70 transition-colors shrink-0"
          aria-label="닫기"
        >
          <X size={12} />
        </button>
      </div>

      {/* ── 상태 표시줄 ───────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-white/2 shrink-0">
        {isActive && (
          <Loader2 size={11} className="animate-spin text-accent shrink-0" />
        )}
        {status === "done" && (
          <CheckCircle2 size={11} className="text-green-400 shrink-0" />
        )}
        {status === "error" && (
          <XCircle size={11} className="text-red-400 shrink-0" />
        )}
        {status === "cancelled" && (
          <AlertTriangle size={11} className="text-white/40 shrink-0" />
        )}
        <span
          className={`text-sm font-medium ${
            status === "done"
              ? "text-green-400"
              : status === "error"
                ? "text-red-400"
                : status === "cancelled"
                  ? "text-white/40"
                  : "text-white/60"
          }`}
        >
          {STATUS_LABEL[status]}
        </span>
        {isActive && currentStep > 0 && (
          <span className="text-xs text-white/30 ml-auto">
            {currentStep} / 25 단계
          </span>
        )}
        {!isActive && hasChanges && (
          <span
            className={`text-xs ml-auto font-medium ${
              highRiskCount > 0 ? "text-red-300" : "text-white/50"
            }`}
            title={
              highRiskCount > 0
                ? `${highRiskCount}건의 빌드/설정 파일 변경 — 높음 위험도`
                : `${changes.length}개 파일 변경됨`
            }
          >
            <span>변경 {changes.length}</span>
            {highRiskCount > 0 && (
              <span className="ml-1">· {RISK_BADGE.high.label} {highRiskCount}</span>
            )}
          </span>
        )}
        <button
          onClick={toggleDesktopTools}
          className={`ml-2 px-2 py-0.5 rounded border text-xs font-medium transition-colors ${
            desktopToolsEnabled
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
              : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"
          }`}
          title="ReAct 데스크톱 도구(screenshot/click/type/key_combo) 활성화"
        >
          Desktop {desktopToolsEnabled ? "ON" : "OFF"}
        </button>
        <button
          onClick={toggleScipTools}
          disabled={availableScipBackends === 0}
          className={`ml-2 px-2 py-0.5 rounded border text-xs font-medium transition-colors ${
            availableScipBackends === 0
              ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
              : isScipEnabled
                ? "border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"
          }`}
          title={
            availableScipBackends === 0
              ? "SCIP 백엔드가 없어 토글할 수 없습니다"
              : `ReAct 정밀 도구(precise_callers/precise_definition). ${scipStatusLines}`
          }
        >
          SCIP {isScipEnabled ? "ON" : "OFF"} ({indexedScipBackends}/{availableScipBackends})
        </button>
        <button
          onClick={runScipRebuild}
          disabled={scipRebuildDisabled}
          className={`ml-2 px-2 py-0.5 rounded border text-xs font-medium transition-colors ${
            scipRebuildDisabled
              ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
          }`}
          title="SCIP 백엔드의 index.scip를 생성/갱신합니다"
        >
          {isScipRebuildInProgress
            ? "SCIP 생성 중..."
            : scipRebuildForce
              ? scipRebuildTargetAll
                ? "SCIP 인덱스 전체 강제 생성"
                : `${scipRebuildTargetLanguageLabel} 강제 생성`
              : scipRebuildTargetMissing
                ? `${scipRebuildTargetLanguageLabel} 인덱스 생성(누락분)`
                : `${scipRebuildTargetLanguageLabel} 인덱스 생성`}
        </button>
        <label className="ml-2 px-2 py-0.5 rounded border border-white/10 bg-white/5 text-xs text-white/65 inline-flex items-center gap-1">
          <span>언어:</span>
          <select
            value={scipRebuildTargetLanguage}
            onChange={(e) => setScipRebuildTargetLanguage(e.target.value)}
            disabled={isScipRebuildInProgress}
            className="bg-transparent text-xs border-none outline-none text-white/75"
            title="재빌드할 SCIP 언어를 선택하세요"
          >
            <option value="all">전체</option>
            {scipAvailableTargets?.map((backend) => (
              <option
                value={backend.value}
                key={backend.value}
                className="bg-[#161b22] text-white"
              >
                {backend.language}
              </option>
            ))}
          </select>
        </label>
        <label className="ml-2 px-2 py-0.5 rounded border border-white/10 bg-white/5 text-xs text-white/65 inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={scipRebuildForce}
            onChange={(e) => setScipRebuildForce(e.target.checked)}
            disabled={isScipRebuildInProgress}
            className="accent-cyan-500 w-3 h-3 disabled:opacity-40"
          />
          강제 재생성
        </label>
      </div>

      {scipRebuildMessage && (
        <div className="px-3 py-1.5 text-xs text-white/55 border-b border-white/5 bg-white/2">
          {scipRebuildMessage}
        </div>
      )}

      {/* ── 단계 목록 (스크롤) ───────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5"
      >
        {steps.map((step, idx) => (
          <StepRow key={idx} step={step} idx={idx} />
        ))}
        {isActive && (
          <div className="flex items-center gap-1.5 py-1 px-1">
            <Loader2
              size={10}
              className="animate-spin text-accent/60 shrink-0"
            />
            <span className="text-xs text-white/30">생각 중...</span>
          </div>
        )}
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-white/25">
            <Bot size={20} />
            <span className="text-sm">에이전트 시작 대기 중</span>
          </div>
        )}
      </div>

      {isPlanDone && state.plannedTools.length > 0 && (
        <div className="shrink-0 border-t border-white/5 bg-cyan-500/5 px-3 py-2">
          <div className="text-xs text-cyan-200/80 mb-1">
            Plan에서 사용한 읽기 도구
          </div>
          <div className="flex flex-wrap gap-1">
            {state.plannedTools.map((tool) => (
              <span
                key={tool}
                className="px-1.5 py-0.5 rounded border border-cyan-400/20 bg-cyan-500/10 text-xs text-cyan-200/90 font-mono"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── 변경 파일 섹션 ──────────────────────────────────────────────── */}
      {hasChanges && (
        <div className="shrink-0 border-t border-white/5 bg-white/2 max-h-[180px] overflow-y-auto">
          <div className="sticky top-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/3 border-b border-white/5">
            <FileEdit size={10} className="text-cyan-400" />
            <span className="text-xs font-semibold text-white/60">
              변경 파일 ({changes.length})
            </span>
            {highRiskCount > 0 && (
              <span className="text-xs text-red-300 font-medium ml-1">
                · {RISK_BADGE.high.label} {highRiskCount}
              </span>
            )}
          </div>
          <div className="p-1.5 space-y-0.5">
            {changes.map((c) => (
              <ChangeRow key={c.path} change={c} />
            ))}
          </div>
        </div>
      )}

      {/* ── undo 결과 리포트 ──────────────────────────── */}
      {undoReport && (
        <div className="shrink-0 border-t border-white/5 px-3 py-2 bg-white/2 text-xs space-y-0.5">
          {undoReport.restored.length > 0 && (
            <div className="text-green-300/80">
              복원 {undoReport.restored.length}개
            </div>
          )}
          {undoReport.removed.length > 0 && (
            <div className="text-cyan-300/80">
              삭제 {undoReport.removed.length}개 (신규 파일)
            </div>
          )}
          {undoReport.errors.length > 0 && (
            <div className="text-red-300/80">
              오류 {undoReport.errors.length}건: {undoReport.errors[0]}
            </div>
          )}
        </div>
      )}

      {/* ── 액션 버튼 ─────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/5 px-3 py-2.5 flex items-center justify-end gap-2">
        {isPlanDone && (
          <div className="mr-auto flex items-center gap-2 text-xs text-white/55">
            <span className="text-cyan-300/80 font-medium">Plan 완료</span>
            <span className="text-white/35">
              읽기 도구 {state.plannedTools.length}개
            </span>
          </div>
        )}
        {isActive && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Square size={11} />
            중단
          </button>
        )}
        {showUndoButton && (
          <button
            onClick={onUndo}
            disabled={undoing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="이번 ReAct run의 모든 파일 변경을 되돌림"
          >
            {undoing ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Undo2 size={11} />
            )}
            {undoing ? "되돌리는 중..." : "변경 되돌리기"}
          </button>
        )}
        {isPlanDone && (
          <button
            onClick={() => onRunAct(null)}
            className="px-3 py-1.5 text-sm rounded-md bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition-colors"
          >
            실행
          </button>
        )}
        {(status === "done" ||
          status === "error" ||
          status === "cancelled") && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80 transition-colors"
          >
            닫기
          </button>
        )}
      </div>
    </div>
  );
};

export default ReactAgentPanel;
