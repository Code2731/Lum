import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitCompareArrows, Loader2, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, AlertCircle, RefreshCw, Copy,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

interface FileDiffReview {
  path: string;
  risk: "safe" | "caution" | "risk";
  summary: string;
}

interface Props {
  model: string;
  repoPat?: string;
  onClose: () => void;
}

export interface DiffReviewFlowSummary {
  badges: [string, string, string];
  helper: string;
}

const RISK_META = {
  safe:    { label: "안전",   color: "text-green-400",  bg: "bg-green-400/10 border-green-400/20",  Icon: CheckCircle2 },
  caution: { label: "주의",   color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20", Icon: AlertTriangle },
  risk:    { label: "위험",   color: "text-red-400",    bg: "bg-red-400/10 border-red-400/20",       Icon: AlertCircle },
};

export function getDiffReviewPrimaryFlowSummary(staged: boolean): DiffReviewFlowSummary {
  return {
    badges: [
      "먼저 범위 선택",
      staged ? "다음 스테이징 분석" : "다음 워킹 트리 분석",
      "마지막 위험 확인",
    ],
    helper: "스테이징과 워킹 트리 중 범위를 먼저 고르고, 분석 후 파일별 위험도를 펼쳐서 확인합니다.",
  };
}

export function getDiffReviewEmptyFlowSummary(staged: boolean): DiffReviewFlowSummary {
  return {
    badges: ["현재 범위", staged ? "스테이징 diff" : "워킹 트리 diff", "AI 파일별 검토"],
    helper: "범위를 확인한 뒤 분석을 누르면 파일별 요약과 위험도가 같은 순서로 정리됩니다.",
  };
}

export function getDiffReviewResultFlowSummary(
  reviews: FileDiffReview[],
): DiffReviewFlowSummary {
  const counts = {
    safe: reviews.filter((review) => review.risk === "safe").length,
    caution: reviews.filter((review) => review.risk === "caution").length,
    risk: reviews.filter((review) => review.risk === "risk").length,
  };

  return {
    badges: [
      `검토 ${reviews.length}개`,
      counts.risk > 0 ? `위험 ${counts.risk}개` : counts.caution > 0 ? `주의 ${counts.caution}개` : "안전 중심",
      "요약 펼치기",
    ],
    helper: "위험 파일부터 먼저 열고, 주의 파일을 이어서 확인한 뒤 각 요약으로 수정 우선순위를 정합니다.",
  };
}

const DiffReviewPanel: React.FC<Props> = ({ model, repoPat = "", onClose }) => {
  const [staged, setStaged] = useState(true);
  const [reviews, setReviews] = useState<FileDiffReview[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const primaryFlow = getDiffReviewPrimaryFlowSummary(staged);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReviews(null);
    try {
      const result = await invoke<FileDiffReview[]>("analyze_diff", {
        repoPath: repoPat,
        staged,
        model,
      });
      setReviews(result);
      // risk 파일 자동 펼침
      const riskPaths = new Set(result.filter(r => r.risk === "risk").map(r => r.path));
      setExpanded(riskPaths);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [model, repoPat, staged]);

  const toggleExpanded = (path: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const counts = reviews
    ? { safe: reviews.filter(r => r.risk === "safe").length,
        caution: reviews.filter(r => r.risk === "caution").length,
        risk: reviews.filter(r => r.risk === "risk").length }
    : null;
  const emptyFlow = getDiffReviewEmptyFlowSummary(staged);
  const resultFlow = reviews ? getDiffReviewResultFlowSummary(reviews) : null;

  const copyText = (text: string) => {
    navigator.clipboard?.writeText?.(text).catch(() => {});
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-2xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8 shrink-0">
          <GitCompareArrows size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">AI Diff 검토기</DialogTitle>
          <div className="flex ml-3 gap-1">
            {(["staged", "unstaged"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setStaged(mode === "staged"); setReviews(null); }}
                className={`text-xs px-2.5 py-0.5 rounded-full transition-colors ${
                  (staged ? "staged" : "unstaged") === mode
                    ? "bg-accent/20 text-accent"
                    : "text-white/30 hover:text-white/60"
                }`}
              >
                {mode === "staged" ? "스테이징" : "워킹 트리"}
              </button>
            ))}
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors text-xs font-medium"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            분석
          </button>
        </div>

        <div className="px-5 py-2.5 border-b border-white/10 bg-white/[0.02] shrink-0">
          <ActionFlowBar
            badges={primaryFlow.badges}
            helper={primaryFlow.helper}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 min-h-0">
          {/* 초기 상태 */}
          {!reviews && !loading && !error && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-white/25">
              <GitCompareArrows size={28} strokeWidth={1.2} />
              <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left">
                <ActionFlowBar
                  badges={emptyFlow.badges}
                  helper={emptyFlow.helper}
                />
              </div>
              <p className="text-sm">위 버튼을 눌러 분석을 시작하세요</p>
              <p className="text-xs text-white/15">
                {staged ? "git diff --cached" : "git diff"} 결과를 AI가 파일별로 검토합니다
              </p>
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="flex items-center justify-center h-48 gap-2 text-white/30 text-sm">
              <Loader2 size={14} className="animate-spin" /> AI가 diff를 분석 중…
            </div>
          )}

          {/* 오류 */}
          {error && (
            <div className="rounded-xl bg-red-400/8 border border-red-400/20 p-4 text-sm text-red-400 flex items-start gap-2">
              <span className="flex-1 break-words">{error}</span>
              <IconButton
                tooltip="오류 텍스트 복사"
                onClick={() => copyText(error)}
                className="p-1 rounded text-white/60 hover:text-white/85 hover:bg-red-400/20 transition-colors"
              >
                <Copy size={11} />
              </IconButton>
            </div>
          )}

          {/* 결과 요약 */}
          {reviews && counts && (
            <>
              {reviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-white/30 text-sm gap-2">
                  <CheckCircle2 size={14} className="text-green-400" />
                  <span>변경사항이 없습니다</span>
                  <span className="text-xs text-white/20">
                    다른 범위로 바꾸거나 새 변경 후 다시 분석할 수 있습니다.
                  </span>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <ActionFlowBar
                      badges={resultFlow!.badges}
                      helper={resultFlow!.helper}
                    />
                  </div>
                  {/* 집계 배지 */}
                  <div className="flex gap-2 mb-3">
                    {(["safe", "caution", "risk"] as const).map(level => {
                      const { label, color, bg } = RISK_META[level];
                      const n = counts[level];
                      if (!n) return null;
                      return (
                        <span key={level} className={`text-xs px-2.5 py-0.5 rounded-full border ${color} ${bg}`}>
                          {label} {n}
                        </span>
                      );
                    })}
                  </div>

                  {/* 파일별 카드 */}
                  {reviews.map(r => {
                    const { Icon, color } = RISK_META[r.risk as keyof typeof RISK_META] ?? RISK_META.caution;
                    const open = expanded.has(r.path);
                    return (
                      <div
                        key={r.path}
                        className="border border-white/7 rounded-xl overflow-hidden"
                      >
                        <button
                          onClick={() => toggleExpanded(r.path)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/3 transition-colors"
                        >
                          <Icon size={12} className={`shrink-0 ${color}`} />
                          <span className="font-mono text-xs text-white/70 flex-1 truncate">{r.path}</span>
                          {open
                            ? <ChevronDown size={11} className="text-white/25 shrink-0" />
                            : <ChevronRight size={11} className="text-white/25 shrink-0" />
                          }
                        </button>
                        {open && (
                          <div className="px-4 pb-3 pt-0.5 text-xs text-white/50 leading-relaxed border-t border-white/5">
                            {r.summary}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DiffReviewPanel;
