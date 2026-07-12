import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

interface InspectorTabPanelProps {
  id: string;
  tabId: string;
  label: string;
  children: React.ReactNode;
}

export interface InspectorTabPanelFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

export function getInspectorTabPanelFlowSummary(label: string): InspectorTabPanelFlowSummary {
  const normalizedLabel = label.trim() || "탭";
  return {
    primary: "인스펙터 탭 확인",
    secondary: normalizedLabel,
    detail: `${normalizedLabel} 내용을 바로 확인하고, 헤더 탭 단축키로 다른 뷰로 빠르게 이동할 수 있습니다.`,
  };
}

const InspectorTabPanel: React.FC<InspectorTabPanelProps> = ({
  id,
  tabId,
  label,
  children,
}) => {
  const flowSummary = getInspectorTabPanelFlowSummary(label);

  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      className="h-full flex flex-col"
    >
      <div className="px-3 py-2 border-b border-white/8 bg-white/[0.015] shrink-0">
        <ActionFlowBar
          badges={[flowSummary.primary, flowSummary.secondary, "Alt+숫자 전환"]}
          helper={flowSummary.detail}
        />
      </div>
      <div className="flex-1 min-h-0">
        <ErrorBoundary label={label}>
          {children}
        </ErrorBoundary>
      </div>
    </section>
  );
};

export default InspectorTabPanel;
