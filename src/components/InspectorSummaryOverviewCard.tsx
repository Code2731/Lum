import React from "react";
import { GitBranch } from "lucide-react";

interface InspectorSummaryOverviewCardProps {
  selectedModel: string;
  activeTabTitle: string;
  activeTabPath: string;
  activeTabBranch?: string;
  activeTabChanged?: number;
  inspectorCardTightClass: string;
}

const InspectorSummaryOverviewCard: React.FC<InspectorSummaryOverviewCardProps> = ({
  selectedModel,
  activeTabTitle,
  activeTabPath,
  activeTabBranch,
  activeTabChanged,
  inspectorCardTightClass,
}) => (
  <>
    <div className={inspectorCardTightClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Workspace</p>
        {activeTabBranch && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-cyan-300/30 bg-cyan-400/12 text-cyan-100 text-xs">
            <GitBranch size={10} />
            {activeTabBranch}
            {activeTabChanged != null && activeTabChanged > 0 && (
              <span className="px-1 rounded bg-amber-400/22 text-amber-200 text-xs">
                {activeTabChanged}
              </span>
            )}
          </span>
        )}
      </div>
      <p className="text-white/82 truncate">{activeTabTitle}</p>
      <p className="text-white/55 font-mono break-all">{activeTabPath}</p>
    </div>
    <div className={inspectorCardTightClass}>
      <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Model</p>
      <p className="text-white/82 break-all">{selectedModel}</p>
    </div>
  </>
);

export default InspectorSummaryOverviewCard;
