import React from "react";
import { X } from "lucide-react";
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

  return (
    <div className="px-2.5 py-2 border-b border-white/10 bg-white/[0.02] shrink-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm tracking-[0.06em] uppercase text-white/65 font-semibold">Inspector</span>
        <button
          onClick={onDensityToggle}
          className={`px-1.5 py-0.5 rounded border text-xs transition-colors ${
            isInspectorCompact
              ? "border-cyan-300/35 bg-cyan-400/16 text-cyan-100"
              : "border-white/[0.1] bg-white/[0.05] text-white/58 hover:text-white/80"
          }`}
          aria-label="Inspector 밀도 토글"
          title={isInspectorCompact ? "Cozy 보기" : "Compact 보기"}
        >
          {isInspectorCompact ? "COMPACT" : "COZY"}
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded border border-white/[0.1] text-white/42 hover:text-white/78 hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Inspector 닫기"
        >
          <X size={12} />
        </button>
      </div>
      <div
        className="flex items-center gap-1"
        role="tablist"
        aria-label="Inspector 탭"
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
            className={`px-2 py-1 rounded-md text-xs border transition-colors ${
              inspectorTab === tab.id
                ? "border-cyan-300/35 bg-cyan-400/16 text-cyan-100"
                : "border-white/10 bg-white/[0.04] text-white/58 hover:text-white/82"
            } focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
            title={`Alt+${tab.shortcut} : ${tab.label}`}
          >
            <span>{tab.label}</span>
            <span className="ml-1 inline-flex text-xs text-white/35">({tab.shortcut})</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default InspectorPanelHeader;
