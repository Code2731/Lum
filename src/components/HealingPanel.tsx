import React from "react";
import { AlertTriangle, Zap, Play, X, Loader2, ShieldAlert, ShieldCheck, Shield, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

export interface HealingResult {
  analysis: string;
  suggestion: string;
  safetyLevel: "Safe" | "Warning" | "Dangerous" | "Blocked";
}

interface Props {
  errorSnippet: string;
  result: HealingResult | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onExecute: (cmd: string) => void;
  onDismiss: () => void;
}

export interface HealingPanelFlowSummary {
  badges: [string, string, string];
  helper: string;
}

const SAFETY_CONFIG = {
  Safe:      { icon: ShieldCheck,  color: "text-green-400",  bg: "bg-green-400/10",  label: "안전" },
  Warning:   { icon: Shield,       color: "text-yellow-400", bg: "bg-yellow-400/10", label: "주의" },
  Dangerous: { icon: ShieldAlert,  color: "text-red-400",    bg: "bg-red-400/10",    label: "위험" },
  Blocked:   { icon: ShieldAlert,  color: "text-red-500",    bg: "bg-red-500/10",    label: "차단" },
};

export function getHealingPrimaryFlowSummary(
  result: HealingResult | null,
  isAnalyzing: boolean,
): HealingPanelFlowSummary {
  if (isAnalyzing) {
    return {
      badges: ["분석 진행 중", "다음 제안 확인", "마지막 실행·차단"],
      helper: "오류 패턴을 분석해 제안 커맨드와 안전도를 계산하는 중입니다. 결과가 나오면 실행 여부를 판단할 수 있습니다.",
    };
  }

  if (result) {
    return {
      badges: ["분석 완료", `${SAFETY_CONFIG[result.safetyLevel].label} 등급 확인`, result.safetyLevel === "Blocked" ? "마지막 자동 차단" : "마지막 실행 결정"],
      helper: "오류 분석과 안전도 계산이 끝났습니다. 제안 내용을 읽고 자동 실행할지 직접 처리할지 결정합니다.",
    };
  }

  return {
    badges: ["먼저 분석", "다음 제안 확인", "마지막 실행·차단"],
    helper: "오류를 먼저 분석하고, 제안 커맨드와 안전도를 확인한 뒤 실행하거나 직접 판단합니다.",
  };
}

export function getHealingDetailFlowSummary(
  result: HealingResult | null,
  isAnalyzing: boolean,
): HealingPanelFlowSummary {
  if (!result && !isAnalyzing) {
    return {
      badges: ["오류 감지", "AI 분석 대기", "실행 전 확인"],
      helper: "분석을 시작하면 원인과 제안 명령이 채워지고, 그 뒤에 실행 여부를 결정할 수 있습니다.",
    };
  }

  if (isAnalyzing) {
    return {
      badges: ["분석 진행 중", "제안 생성", "안전도 계산"],
      helper: "현재 오류 패턴을 읽고 제안 명령과 안전도를 계산하는 중입니다.",
    };
  }

  return {
    badges: [
      SAFETY_CONFIG[result!.safetyLevel].label,
      result!.suggestion && result!.safetyLevel !== "Blocked" ? "제안 커맨드 준비" : "직접 판단 필요",
      result!.safetyLevel === "Blocked" ? "자동 차단" : "실행 결정",
    ],
    helper: "분석 설명을 읽고 안전도를 먼저 본 뒤, 제안 커맨드를 실행할지 직접 처리할지 결정합니다.",
  };
}

const HealingPanel: React.FC<Props> = ({
  errorSnippet,
  result,
  isAnalyzing,
  onAnalyze,
  onExecute,
  onDismiss,
}) => {
  const safety = result ? SAFETY_CONFIG[result.safetyLevel] : null;
  const SafetyIcon = safety?.icon;
  const primaryFlow = getHealingPrimaryFlowSummary(result, isAnalyzing);
  const detailFlow = getHealingDetailFlowSummary(result, isAnalyzing);

  return (
    <div className="absolute bottom-0 inset-x-0 p-3 z-20 pointer-events-none">
      <div className="pointer-events-auto bg-[#161b22] border border-yellow-500/30 rounded-lg shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-yellow-500/5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={12} className="text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-400">에러 감지됨</span>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/30 hover:text-white/70 transition-colors"
            aria-label="닫기"
          >
            <X size={12} />
          </button>
        </div>

        {/* 에러 스니펫 */}
        <div className="px-3 py-2 bg-red-500/5 border-b border-white/5">
          <div className="flex items-start gap-1.5">
            <pre className="text-xs font-mono text-red-300/80 truncate max-h-10 overflow-hidden flex-1">
              {errorSnippet}
            </pre>
            <IconButton
              tooltip="오류 텍스트 복사"
              onClick={() => {
                navigator.clipboard?.writeText?.(errorSnippet).catch(() => {});
              }}
              className="p-1 rounded text-red-200/85 hover:text-red-100 hover:bg-red-500/20 transition-colors"
            >
              <Copy size={11} />
            </IconButton>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
          <ActionFlowBar
            badges={primaryFlow.badges}
            helper={primaryFlow.helper}
          />
        </div>

        {/* 분석 결과 또는 분석 버튼 */}
        <div className="px-3 py-2">
          {!result && !isAnalyzing && (
            <div className="space-y-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar
                  badges={detailFlow.badges}
                  helper={detailFlow.helper}
                />
              </div>
              <button
                onClick={onAnalyze}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
              >
                <Zap size={11} />
                AI로 원인 분석
              </button>
            </div>
          )}

          {isAnalyzing && (
            <div className="space-y-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar
                  badges={detailFlow.badges}
                  helper={detailFlow.helper}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Loader2 size={11} className="animate-spin" />
                분석 중…
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar
                  badges={detailFlow.badges}
                  helper={detailFlow.helper}
                />
              </div>
              {/* 분석 내용 */}
              <p className="text-sm text-white/70 leading-relaxed">{result.analysis}</p>

              {/* 제안 커맨드 */}
              {result.suggestion && result.safetyLevel !== "Blocked" && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-white/5 px-2 py-1 rounded text-green-300 truncate">
                    {result.suggestion}
                  </code>

                  {/* 안전 배지 */}
                  {safety && SafetyIcon && (
                    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${safety.bg} ${safety.color} shrink-0`}>
                      <SafetyIcon size={10} />
                      {safety.label}
                    </span>
                  )}

                  {/* 실행 버튼 */}
                  {result.safetyLevel === "Safe" && (
                    <button
                      onClick={() => onExecute(result.suggestion)}
                      className="flex items-center gap-1 text-sm px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors shrink-0"
                    >
                      <Play size={10} />
                      실행
                    </button>
                  )}
                  {result.safetyLevel === "Warning" && (
                    <button
                      onClick={() => onExecute(result.suggestion)}
                      className="flex items-center gap-1 text-sm px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors shrink-0"
                    >
                      <Play size={10} />
                      확인 후 실행
                    </button>
                  )}
                  {result.safetyLevel === "Dangerous" && (
                    <span className="text-xs text-red-400/70 shrink-0">위험 — 직접 실행</span>
                  )}
                </div>
              )}

              {result.safetyLevel === "Blocked" && (
                <p className="text-sm text-red-400">제안된 명령어가 차단 패턴에 해당합니다.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HealingPanel;
