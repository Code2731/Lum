import React from "react";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

interface Props {
  report: any;
}

export interface CodeReviewDashboardFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

export function getCodeReviewDashboardFlowSummary(report: any): CodeReviewDashboardFlowSummary {
  if (!report) {
    return {
      primary: "리뷰 결과 없음",
      secondary: "대기 중",
      detail: "아직 표시할 코드 리뷰 결과가 없습니다.",
    };
  }

  const items = Array.isArray(report.items) ? report.items : [];
  const first = items[0];
  const firstLabel =
    first && typeof first === "object" && typeof first.file === "string"
      ? first.file
      : "요약 우선 확인";

  return {
    primary: "리뷰 결과 확인",
    secondary: `${items.length}개 항목`,
    detail: `${firstLabel}부터 확인하고 필요한 수정 작업으로 바로 이어갈 수 있습니다.`,
  };
}

const CodeReviewDashboard: React.FC<Props> = ({ report }) => {
  if (!report) return null;
  const flowSummary = getCodeReviewDashboardFlowSummary(report);
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
      <ActionFlowBar
        badges={[flowSummary.primary, flowSummary.secondary, "마지막 수정 연결"]}
        helper={flowSummary.detail}
      />
      <pre className="text-xs font-mono text-white/72 whitespace-pre-wrap break-all">
        {JSON.stringify(report, null, 2)}
      </pre>
    </div>
  );
};

export default CodeReviewDashboard;
