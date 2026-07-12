import React from "react";
import { Layers, Play, X } from "lucide-react";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import type { EnvSuggestion } from "../hooks/useEnvAutoDetector";

interface Props {
  suggestions: EnvSuggestion[];
  onExecute: (cmd: string) => void;
  onDismiss: () => void;
}

export interface EnvSuggestionFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

const RUNTIME_COLORS: Record<string, string> = {
  "Node.js": "text-green-400 bg-green-400/10 border-green-400/20",
  Python: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  Ruby: "text-red-400 bg-red-400/10 border-red-400/20",
  asdf: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  direnv: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
};

export function getEnvSuggestionFlowSummary(
  suggestions: EnvSuggestion[],
): EnvSuggestionFlowSummary {
  if (suggestions.length === 0) {
    return {
      primary: "환경 제안 없음",
      secondary: "실행 대기",
      detail: "자동 실행할 환경 제안이 아직 없어 현재 설정을 유지합니다.",
    };
  }

  const first = suggestions[0];
  return {
    primary: "환경 제안 준비",
    secondary: `${first.runtime} · ${suggestions.length}개`,
    detail: "감지된 런타임과 실행 명령을 확인한 뒤 현재 프로젝트에 맞는 항목만 바로 실행할 수 있습니다.",
  };
}

const EnvSuggestionToast: React.FC<Props> = ({ suggestions, onExecute, onDismiss }) => {
  const flowSummary = getEnvSuggestionFlowSummary(suggestions);

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 w-[480px] max-w-[92vw] animate-in slide-in-from-bottom-2 duration-200">
      <div className="bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/3">
          <Layers size={12} className="text-accent shrink-0" />
          <span className="text-sm font-semibold text-white/70 flex-1">환경 파일 감지됨</span>
          <button
            onClick={onDismiss}
            className="text-white/25 hover:text-white/60 transition-colors p-0.5 rounded"
            aria-label="닫기"
          >
            <X size={11} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
          <ActionFlowBar
            badges={[flowSummary.primary, flowSummary.secondary, "마지막 실행"]}
            helper={flowSummary.detail}
            tone="cyan"
          />
        </div>

        {/* 제안 목록 */}
        <div className="p-2 space-y-1.5">
          {suggestions.map((s) => {
            const colorCls = RUNTIME_COLORS[s.runtime] ?? "text-white/50 bg-white/5 border-white/10";
            return (
              <div
                key={s.file}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/3 border border-white/5"
              >
                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${colorCls}`}>
                  {s.runtime}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/50 truncate">{s.description}</p>
                  <p className="text-xs font-mono text-white/30 truncate mt-0.5">$ {s.cmd}</p>
                </div>
                <button
                  onClick={() => onExecute(s.cmd)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent/15 text-accent hover:bg-accent/25 transition-colors font-medium"
                >
                  <Play size={9} />
                  실행
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EnvSuggestionToast;
