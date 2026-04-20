import React from "react";
import { AlertTriangle, Zap, Play, X, Loader2, ShieldAlert, ShieldCheck, Shield } from "lucide-react";

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

const SAFETY_CONFIG = {
  Safe:      { icon: ShieldCheck,  color: "text-green-400",  bg: "bg-green-400/10",  label: "안전" },
  Warning:   { icon: Shield,       color: "text-yellow-400", bg: "bg-yellow-400/10", label: "주의" },
  Dangerous: { icon: ShieldAlert,  color: "text-red-400",    bg: "bg-red-400/10",    label: "위험" },
  Blocked:   { icon: ShieldAlert,  color: "text-red-500",    bg: "bg-red-500/10",    label: "차단" },
};

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

  return (
    <div className="absolute bottom-0 inset-x-0 p-3 z-20 pointer-events-none">
      <div className="pointer-events-auto bg-[#161b22] border border-yellow-500/30 rounded-lg shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-yellow-500/5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={12} className="text-yellow-400" />
            <span className="text-[11px] font-semibold text-yellow-400">에러 감지됨</span>
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
          <pre className="text-[10px] font-mono text-red-300/80 truncate max-h-10 overflow-hidden">
            {errorSnippet}
          </pre>
        </div>

        {/* 분석 결과 또는 분석 버튼 */}
        <div className="px-3 py-2">
          {!result && !isAnalyzing && (
            <button
              onClick={onAnalyze}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
            >
              <Zap size={11} />
              AI로 원인 분석
            </button>
          )}

          {isAnalyzing && (
            <div className="flex items-center gap-2 text-[11px] text-white/50">
              <Loader2 size={11} className="animate-spin" />
              분석 중…
            </div>
          )}

          {result && (
            <div className="space-y-2">
              {/* 분석 내용 */}
              <p className="text-[11px] text-white/70 leading-relaxed">{result.analysis}</p>

              {/* 제안 커맨드 */}
              {result.suggestion && result.safetyLevel !== "Blocked" && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] font-mono bg-white/5 px-2 py-1 rounded text-green-300 truncate">
                    {result.suggestion}
                  </code>

                  {/* 안전 배지 */}
                  {safety && SafetyIcon && (
                    <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${safety.bg} ${safety.color} shrink-0`}>
                      <SafetyIcon size={10} />
                      {safety.label}
                    </span>
                  )}

                  {/* 실행 버튼 */}
                  {result.safetyLevel === "Safe" && (
                    <button
                      onClick={() => onExecute(result.suggestion)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors shrink-0"
                    >
                      <Play size={10} />
                      실행
                    </button>
                  )}
                  {result.safetyLevel === "Warning" && (
                    <button
                      onClick={() => onExecute(result.suggestion)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors shrink-0"
                    >
                      <Play size={10} />
                      확인 후 실행
                    </button>
                  )}
                  {result.safetyLevel === "Dangerous" && (
                    <span className="text-[10px] text-red-400/70 shrink-0">위험 — 직접 실행</span>
                  )}
                </div>
              )}

              {result.safetyLevel === "Blocked" && (
                <p className="text-[11px] text-red-400">제안된 명령어가 차단 패턴에 해당합니다.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HealingPanel;
