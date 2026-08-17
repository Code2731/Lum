import React from "react";
import { X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { InspectorDensity, InspectorTab, InspectorTabItem } from "./InspectorPanel/types";

interface InspectorPanelHeaderProps {
  inspectorDensity: InspectorDensity;
  inspectorTab: InspectorTab;
  inspectorTabs: readonly InspectorTabItem[];
  inspectorTabRefs: React.MutableRefObject<Record<InspectorTab, HTMLButtonElement | null>>;
  onDensityToggle: () => void;
  onClose: () => void;
  onTabSelect: (tab: InspectorTab) => void;
  onTabKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export interface InspectorPanelHeaderMeta {
  densityLabel: string;
  densityToggleTitle: string;
}

export function getInspectorPanelHeaderMeta(
  inspectorDensity: InspectorDensity,
): InspectorPanelHeaderMeta {
  const isInspectorCompact = inspectorDensity === "compact";
  return {
    densityLabel: isInspectorCompact ? "컴팩트 흐름" : "여유 흐름",
    densityToggleTitle: isInspectorCompact ? "여유 보기" : "컴팩트 보기",
  };
}

export function getInspectorTabTitle(tab: InspectorTabItem): string {
  return `Alt+${tab.shortcut} : ${tab.label}`;
}

const InspectorPanelHeader: React.FC<InspectorPanelHeaderProps> = ({
  inspectorDensity,
  inspectorTab,
  inspectorTabs,
  inspectorTabRefs,
  onDensityToggle,
  onClose,
  onTabSelect,
  onTabKeyDown,
}) => {
  const isInspectorCompact = inspectorDensity === "compact";
  const activeTabMeta = inspectorTabs.find((tab) => tab.id === inspectorTab) ?? inspectorTabs[0];
  const headerMeta = getInspectorPanelHeaderMeta(inspectorDensity);

  return (
    <div className="px-2.5 py-2 border-b border-white/10 bg-white/[0.02] shrink-0">
      <div className="flex items-center justify-between gap-3 mb-2.5 pl-0.5">
        <span className="text-sm tracking-[0.06em] uppercase text-white/65 font-semibold">인스펙터</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onDensityToggle}
            className={`px-1.5 py-0.5 rounded border text-xs transition-colors ${
              isInspectorCompact
                ? "border-cyan-300/38 bg-cyan-400/18 text-cyan-50 shadow-[0_8px_18px_rgba(34,211,238,0.14)]"
                : "border-white/[0.1] bg-white/[0.05] text-white/58 hover:text-white/80 hover:bg-white/[0.08]"
            }`}
            aria-label="인스펙터 밀도 토글"
            title={headerMeta.densityToggleTitle}
          >
            {isInspectorCompact ? "컴팩트" : "여유"}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded border border-white/[0.12] bg-white/[0.03] text-white/38 hover:text-white/74 hover:bg-white/[0.08] hover:border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="인스펙터 닫기"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
        <StatusBadge tone="neutral">현재 탭</StatusBadge>
        <StatusBadge tone="neutral">{activeTabMeta?.label ?? "요약"}</StatusBadge>
        <StatusBadge tone="neutral">{headerMeta.densityLabel}</StatusBadge>
        <StatusBadge tone="neutral">Alt+{activeTabMeta?.shortcut ?? "1"}</StatusBadge>
        <span className="text-[10px] text-white/40">
          탭, 보기 밀도, 단축키를 먼저 확인하고 바로 아래에서 전환합니다.
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2 pl-0.5" style={{ writingMode: "horizontal-tb" }}>
        <StatusBadge tone="neutral" className="shrink-0">바로 전환</StatusBadge>
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5"
            style={{ writingMode: "horizontal-tb" }}
          role="tablist"
          aria-label="인스펙터 탭"
          onKeyDown={onTabKeyDown}
        >
          {inspectorTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              ref={(el) => {
                inspectorTabRefs.current[tab.id] = el;
              }}
              role="tab"
              id={`inspector-tab-${tab.id}`}
              aria-selected={inspectorTab === tab.id}
              aria-controls={`inspector-tabpanel-${tab.id}`}
              aria-keyshortcuts={`Alt+${tab.shortcut}`}
              tabIndex={inspectorTab === tab.id ? 0 : -1}
              onClick={() => onTabSelect(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTabSelect(tab.id);
                }
              }}
              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                inspectorTab === tab.id
                  ? "border-cyan-300/42 bg-cyan-400/[0.22] text-cyan-50 shadow-[0_8px_24px_rgba(34,211,238,0.16)]"
                  : "border-white/10 bg-white/[0.03] text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-white/18 hover:text-white/84 hover:bg-white/[0.08]"
              } focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
              style={{ writingMode: "horizontal-tb" }}
              title={getInspectorTabTitle(tab)}
            >
              <span>{tab.label}</span>
              <span
                className={`ml-1 inline-flex text-xs ${
                  inspectorTab === tab.id ? "text-cyan-100/78" : "text-white/35"
                }`}
              >
                ({tab.shortcut})
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InspectorPanelHeader;
