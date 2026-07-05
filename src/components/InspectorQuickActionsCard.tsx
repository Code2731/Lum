import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  FolderTree,
  GitCompareArrows,
  Layers,
  Library,
  Search,
} from "lucide-react";

interface InspectorQuickActionsCardProps {
  quickActionsExpanded: boolean;
  inspectorCardRegularClass: string;
  inspectorQuickGridClass: string;
  inspectorQuickActionsToggleRef: React.RefObject<HTMLButtonElement | null>;
  inspectorQuickActionsAdvancedRef: React.RefObject<HTMLDivElement | null>;
  onQuickActionsToggle: () => void;
  onQuickActionsToggleKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onQuickActionsAdvancedKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onToggleProjectBin: () => void;
  onOpenWorkspace: () => void;
  onOpenHistory: () => void;
  onOpenDiffReview: () => void;
  onOpenFailedBlock: () => void;
  onTabSelect: (tab: "summary" | "rag" | "scripts" | "sysmon") => void;
}

const InspectorQuickActionsCard: React.FC<InspectorQuickActionsCardProps> = ({
  quickActionsExpanded,
  inspectorCardRegularClass,
  inspectorQuickGridClass,
  inspectorQuickActionsToggleRef,
  inspectorQuickActionsAdvancedRef,
  onQuickActionsToggle,
  onQuickActionsToggleKeyDown,
  onQuickActionsAdvancedKeyDown,
  onToggleProjectBin,
  onOpenWorkspace,
  onOpenHistory,
  onOpenDiffReview,
  onOpenFailedBlock,
  onTabSelect,
}) => (
  <div className={inspectorCardRegularClass}>
    <p className="text-white/45 uppercase tracking-[0.06em] text-xs">빠른 작업</p>
    <div className={inspectorQuickGridClass}>
      <button
        type="button"
        onClick={onToggleProjectBin}
        className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
      >
        <FolderTree size={11} />
        프로젝트 보관함
      </button>
      <button
        type="button"
        onClick={onOpenWorkspace}
        className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
      >
        <Layers size={11} />
        작업공간
      </button>
      <button
        type="button"
        onClick={() => onTabSelect("rag")}
        className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
      >
        <Library size={11} />
        RAG
      </button>
      <button
        type="button"
        data-inspector-quick-actions-toggle
        aria-controls="inspector-quick-actions-advanced"
        aria-expanded={quickActionsExpanded}
        ref={inspectorQuickActionsToggleRef}
        onKeyDown={onQuickActionsToggleKeyDown}
        onClick={onQuickActionsToggle}
        className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
      >
        {quickActionsExpanded ? "축소" : "더보기"}
      </button>
      <AnimatePresence initial={false}>
        {quickActionsExpanded && (
          <motion.div
            id="inspector-quick-actions-advanced"
            data-inspector-quick-actions-advanced
            key="inspector-quick-actions-advanced"
            className="col-span-2"
            ref={inspectorQuickActionsAdvancedRef}
            onKeyDown={onQuickActionsAdvancedKeyDown}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className={inspectorQuickGridClass}>
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                <Search size={11} />
                기록
              </button>
              <button
                type="button"
                onClick={onOpenDiffReview}
                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                <GitCompareArrows size={11} />
                변경내역
              </button>
              <button
                type="button"
                onClick={onOpenFailedBlock}
                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-rose-300/30 bg-rose-400/12 text-rose-100 hover:bg-rose-400/20 transition-colors"
              >
                <AlertTriangle size={11} />
                실패
              </button>
              <button
                type="button"
                onClick={() => onTabSelect("scripts")}
                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                스크립트
              </button>
              <button
                type="button"
                onClick={() => onTabSelect("sysmon")}
                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                <Activity size={11} />
                시스템
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
);

export default InspectorQuickActionsCard;
