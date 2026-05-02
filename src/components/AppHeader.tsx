// Phase 126 — App.tsx 분해 1차: 헤더 추출.
// 툴바 버튼 그룹·모델 배지·Privacy Ledger 등 헤더 전체.
// state는 App.tsx가 소유, 여기는 props로 받아 렌더 + 상호작용만.

import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2,
  Package, Database, X, SlidersHorizontal, GitCompareArrows, Palette,
  BookOpen, Bell, Activity, FolderTree, Brain, PlugZap, Users, Sparkles, Library, Hammer, Layers,
} from "lucide-react";
import { ToolbarIconButton, ToolbarSeparator } from "@/components/ui/toolbar-icon-button";
import WindowControls from "./WindowControls";
import PrivacyLedgerBadge from "./PrivacyLedgerBadge";
import NotificationCenter from "./NotificationCenter";
import type { usePanelVisibility } from "../hooks/usePanelVisibility";
import type { useSquads } from "../hooks/useSquads";
import type { usePrivacyLedger } from "../hooks/usePrivacyLedger";
import type { useNotificationCenter } from "../hooks/useNotificationCenter";
import type { useScriptLibrary } from "../hooks/useScriptLibrary";
import type { useHardwareSpecs } from "../hooks/useHardwareSpecs";

type ViewMode = "terminal" | "canvas" | "list";

const VIEW_BUTTONS: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: "terminal", icon: <TerminalSquare size={14} />, label: "터미널" },
  { mode: "list", icon: <LayoutList size={14} />, label: "리스트" },
  { mode: "canvas", icon: <MousePointer2 size={14} />, label: "캔버스" },
];

// Phase 126 — Advanced 팝오버 안에서 "신규" 배지를 띄울 기능 ID 목록.
// 사용자가 클릭하면 영구 dismiss(→ ui_seen_advanced_features 누적). 새 페이즈 출시 시 추가/회전.
export const NEW_ADVANCED_FEATURES = ["healing", "recall", "lora"] as const;
export type NewFeatureId = typeof NEW_ADVANCED_FEATURES[number];

interface Props {
  // hardware
  specs: ReturnType<typeof useHardwareSpecs>["specs"];
  specsLoading: boolean;
  // view
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  // model badges
  loadedModelId: string | null;
  heavyModelId: string | null;
  heavyEnabled: boolean;
  // stores
  privacyLedger: ReturnType<typeof usePrivacyLedger>;
  squadStore: ReturnType<typeof useSquads>;
  notifCenter: ReturnType<typeof useNotificationCenter>;
  scriptLib: ReturnType<typeof useScriptLibrary>;
  // panel visibility (bundle)
  panels: ReturnType<typeof usePanelVisibility>;
  // file explorer (App-local state, not in panels hook)
  showFileExplorer: boolean;
  setShowFileExplorer: React.Dispatch<React.SetStateAction<boolean>>;
  // reasoning toggle
  showReasoning: boolean;
  toggleReasoning: () => void;
  // toolbar advanced mode
  toolbarShowAdvanced: boolean;
  toggleToolbarAdvanced: () => void;
  showAdvancedOverflow: boolean;
  setShowAdvancedOverflow: React.Dispatch<React.SetStateAction<boolean>>;
  // workspace loader
  loadWorkspaces: () => void;
  // Phase 126 — Advanced popover dot 배지 상태
  seenAdvancedFeatures: string[];
  onMarkAdvancedSeen: (id: string) => void;
}

const AppHeader: React.FC<Props> = ({
  specs, specsLoading,
  viewMode, setViewMode,
  loadedModelId, heavyModelId, heavyEnabled,
  privacyLedger, squadStore, notifCenter, scriptLib,
  panels,
  showFileExplorer, setShowFileExplorer,
  showReasoning, toggleReasoning,
  toolbarShowAdvanced, toggleToolbarAdvanced,
  showAdvancedOverflow, setShowAdvancedOverflow,
  loadWorkspaces,
  seenAdvancedFeatures, onMarkAdvancedSeen,
}) => {
  const isNew = (id: string) =>
    (NEW_ADVANCED_FEATURES as readonly string[]).includes(id) && !seenAdvancedFeatures.includes(id);
  const hasUnseenAdvanced = NEW_ADVANCED_FEATURES.some((id) => !seenAdvancedFeatures.includes(id));
  const {
    setShowModelManager,
    showRagPanel, setShowRagPanel,
    setShowXllmPanel,
    showDiffReview, setShowDiffReview,
    showThemePanel, setShowThemePanel,
    showWorkspace, setShowWorkspace,
    showScriptPanel, setShowScriptPanel,
    showSysmon, setShowSysmon,
    showNotifCenter, setShowNotifCenter,
    showMcpPanel, setShowMcpPanel,
    showSquadPanel, setShowSquadPanel,
    showHealingDataset, setShowHealingDataset,
    showRecall, setShowRecall,
    showLoraForge, setShowLoraForge,
  } = panels;

  // 모델명 짧게 — 마지막 segment에서 흔한 suffix 제거
  const shortName = (n?: string | null) => {
    if (!n) return "";
    const last = n.match(/[^/\\]+$/)?.[0] ?? n;
    return last
      .replace(/-Instruct$/i, "")
      .replace(/-exl2$/i, "")
      .replace(/-MLX-?\d*bit$/i, "")
      .replace(/-\d+bit$/i, "")
      .replace(/-\d+\.\d+bpw$/i, "")
      .replace(/-\d+_\d+$/i, "");
  };
  const fastEmpty = !loadedModelId;
  const fast = fastEmpty ? "Empty Model" : shortName(loadedModelId);
  const heavy = shortName(heavyModelId);

  return (
    <header
      data-tauri-drag-region
      className="h-10 border-b border-white/5 flex items-center justify-between px-4 shrink-0 select-none gap-2 min-w-0"
    >
      <div data-tauri-drag-region className="flex items-center gap-4 shrink-0">
        <WindowControls />
        <div data-tauri-drag-region className="flex items-center gap-1.5 text-xs text-white/45 font-medium shrink-0 whitespace-nowrap">
          <Cpu size={12} />
          {specsLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : specs ? (
            <span title={specs.recommendation_reason}>
              {(() => {
                if (specs.gpu_vram_gb && specs.gpu_vram_gb > 0) {
                  return `${specs.gpu_vram_gb}GB VRAM`;
                }
                const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
                if (specs.gpu_type === "integrated" || isMac) {
                  return `${specs.total_memory_gb}GB 통합메모리`;
                }
                return `${specs.total_memory_gb}GB RAM`;
              })()}
            </span>
          ) : null}
        </div>

        <div className="flex bg-white/5 p-0.5 rounded-md">
          {VIEW_BUTTONS.map(({ mode, icon, label }) => (
            <button
              key={mode}
              aria-label={label}
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={`p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                viewMode === mode ? "bg-white/15 text-white" : "text-white/45 hover:text-white/75"
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div data-tauri-drag-region className="flex-1 h-full" />

      <div data-tauri-drag-region className="flex items-center gap-1 min-w-0">
        <div data-tauri-drag-region className="flex items-center gap-1 min-w-0 overflow-hidden mr-1">
          <div
            data-tauri-drag-region
            className={`text-xs px-2 py-1 rounded-md truncate max-w-[140px] ${
              fastEmpty
                ? "bg-white/5 text-white/30 italic"
                : "bg-blue-400/10 text-blue-300"
            }`}
            title={
              fastEmpty
                ? "TabbyAPI에 로드된 모델이 없습니다 — XllmPanel에서 모델을 [사용]하세요"
                : `Fast (TabbyAPI): ${loadedModelId}`
            }
          >
            {fastEmpty ? "○" : "⚡"} {fast}
          </div>
          {heavyEnabled && heavy && (
            <div
              data-tauri-drag-region
              className="text-xs px-2 py-1 rounded-md bg-purple-400/10 text-purple-300 truncate max-w-[140px]"
              title={`Heavy Track (mistral.rs): ${heavyModelId}`}
            >
              🚀 {heavy}
            </div>
          )}
        </div>

        <PrivacyLedgerBadge
          state={privacyLedger.state}
          isAllOnDevice={privacyLedger.isAllOnDevice}
          onReset={privacyLedger.reset}
        />
        <ToolbarSeparator />

        {/* 그룹 1 — 워크스페이스 / 탐색 */}
        <ToolbarIconButton
          label="파일 탐색기"
          shortcut="⌘B"
          active={showFileExplorer}
          onClick={() => setShowFileExplorer(v => {
            const next = !v;
            invoke("save_ui_preferences", { showFileExplorer: next }).catch(() => {});
            return next;
          })}
        >
          <FolderTree size={14} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="워크스페이스"
          shortcut="⌘⇧S"
          active={showWorkspace}
          onClick={() => { setShowWorkspace(true); loadWorkspaces(); }}
        >
          <Layers size={14} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="스크립트 라이브러리"
          shortcut="⌘⇧L"
          active={showScriptPanel}
          onClick={() => { setShowScriptPanel(v => { if (!v) scriptLib.loadScripts(); return !v; }); }}
        >
          <BookOpen size={14} />
        </ToolbarIconButton>

        <ToolbarSeparator />

        {/* 그룹 2 기본 — 매일 쓰는 AI/모델 액션 */}
        <ToolbarIconButton
          label={`추론 토큰 ${showReasoning ? "표시 중" : "숨김"}`}
          tone="cyan"
          active={showReasoning}
          onClick={toggleReasoning}
        >
          <Brain size={14} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="모델 관리"
          onClick={() => setShowModelManager(true)}
        >
          <Package size={14} />
        </ToolbarIconButton>

        <ToolbarSeparator />

        {/* 그룹 2 고급 — toolbar_show_advanced=true면 인라인, 아니면 "더보기" 팝오버 */}
        {toolbarShowAdvanced && (
          <>
            <ToolbarIconButton
              label="MCP 서버"
              active={showMcpPanel}
              onClick={() => setShowMcpPanel(v => !v)}
            >
              <PlugZap size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Worktree Squad"
              active={showSquadPanel}
              badge={squadStore.squads.length > 0}
              onClick={() => { setShowSquadPanel(v => !v); if (!showSquadPanel) squadStore.load(); }}
            >
              <Users size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Auto-Heal 학습 데이터셋"
              tone="cyan"
              active={showHealingDataset}
              onClick={() => setShowHealingDataset(v => !v)}
            >
              <Sparkles size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="메모리 검색 (history/healing/memory)"
              tone="cyan"
              active={showRecall}
              onClick={() => setShowRecall(v => !v)}
            >
              <Library size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="LoRA Forge — 내 데이터로 모델 학습"
              tone="cyan"
              active={showLoraForge}
              onClick={() => setShowLoraForge(v => !v)}
            >
              <Hammer size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="RAG 코드 검색"
              active={showRagPanel}
              onClick={() => setShowRagPanel(v => !v)}
            >
              <Database size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="xLLM 최적화 설정"
              onClick={() => setShowXllmPanel(true)}
            >
              <SlidersHorizontal size={14} />
            </ToolbarIconButton>
            <ToolbarSeparator />
          </>
        )}

        {!toolbarShowAdvanced && (
          <div className="relative">
            <ToolbarIconButton
              label="고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)"
              active={showAdvancedOverflow}
              badge={squadStore.squads.length > 0 || hasUnseenAdvanced}
              onClick={() => setShowAdvancedOverflow(v => !v)}
            >
              <SlidersHorizontal size={14} />
            </ToolbarIconButton>
            <AnimatePresence>
              {showAdvancedOverflow && (
                <motion.div
                  key="advanced-overflow"
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  style={{ transformOrigin: "top right" }}
                  className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-white/10 bg-[#0d1117]/95 backdrop-blur-md shadow-xl p-2 space-y-0.5"
                >
                  <AdvancedRow
                    icon={<PlugZap size={13} />}
                    label="MCP 서버"
                    onClick={() => { setShowAdvancedOverflow(false); setShowMcpPanel(true); }}
                  />
                  <AdvancedRow
                    icon={<Users size={13} />}
                    label="Worktree Squad"
                    badge={squadStore.squads.length > 0}
                    onClick={() => { setShowAdvancedOverflow(false); setShowSquadPanel(true); squadStore.load(); }}
                  />
                  <AdvancedRow
                    icon={<Sparkles size={13} className="text-cyan-300" />}
                    label="Auto-Heal 학습 데이터셋"
                    isNew={isNew("healing")}
                    onClick={() => { onMarkAdvancedSeen("healing"); setShowAdvancedOverflow(false); setShowHealingDataset(true); }}
                  />
                  <AdvancedRow
                    icon={<Library size={13} className="text-cyan-300" />}
                    label="메모리 검색"
                    isNew={isNew("recall")}
                    onClick={() => { onMarkAdvancedSeen("recall"); setShowAdvancedOverflow(false); setShowRecall(true); }}
                  />
                  <AdvancedRow
                    icon={<Hammer size={13} className="text-cyan-300" />}
                    label="LoRA Forge"
                    isNew={isNew("lora")}
                    onClick={() => { onMarkAdvancedSeen("lora"); setShowAdvancedOverflow(false); setShowLoraForge(true); }}
                  />
                  <AdvancedRow
                    icon={<Database size={13} />}
                    label="RAG 코드 검색"
                    onClick={() => { setShowAdvancedOverflow(false); setShowRagPanel(true); }}
                  />
                  <AdvancedRow
                    icon={<SlidersHorizontal size={13} />}
                    label="xLLM 설정"
                    onClick={() => { setShowAdvancedOverflow(false); setShowXllmPanel(true); }}
                  />
                  <div className="h-px bg-white/8 my-1" />
                  <button
                    type="button"
                    onClick={() => { toggleToolbarAdvanced(); setShowAdvancedOverflow(false); }}
                    className="w-full text-left px-2 py-1.5 rounded text-[10.5px] text-white/55 hover:text-white/85 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    툴바에 항상 표시 (고급 기능 펼치기)
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {toolbarShowAdvanced && (
          <ToolbarIconButton
            label="고급 기능 접기"
            onClick={toggleToolbarAdvanced}
          >
            <X size={14} />
          </ToolbarIconButton>
        )}

        {/* 그룹 3 — 도구 / 알림 */}
        <ToolbarIconButton
          label="AI Diff 리뷰"
          shortcut="⌘⇧R"
          active={showDiffReview}
          onClick={() => setShowDiffReview(true)}
        >
          <GitCompareArrows size={14} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="시스템 모니터"
          shortcut="⌘⇧M"
          active={showSysmon}
          onClick={() => setShowSysmon(v => !v)}
        >
          <Activity size={14} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="터미널 테마"
          shortcut="⌘,"
          active={showThemePanel}
          onClick={() => setShowThemePanel(true)}
        >
          <Palette size={14} />
        </ToolbarIconButton>
        <div className="relative">
          <ToolbarIconButton
            label="알림 센터"
            active={showNotifCenter}
            badge={notifCenter.unreadCount > 0}
            onClick={() => { setShowNotifCenter(v => !v); if (!showNotifCenter) notifCenter.markAllRead(); }}
          >
            <Bell size={14} />
          </ToolbarIconButton>
          <AnimatePresence>
            {showNotifCenter && (
              <motion.div
                key="notif-center"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ transformOrigin: "top right" }}
              >
                <NotificationCenter
                  notifications={notifCenter.notifications}
                  unreadCount={notifCenter.unreadCount}
                  onMarkAllRead={notifCenter.markAllRead}
                  onDismiss={notifCenter.dismiss}
                  onClear={notifCenter.clear}
                  onClose={() => setShowNotifCenter(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

const AdvancedRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  /** 카운트 dot — squad 활성 등 상태성 마커. emerald. */
  badge?: boolean;
  /** Phase 126: "처음 보는 기능" 마커 — 클릭 시 영구 dismiss. amber + "NEW" 라벨로 더 눈에 띄게. */
  isNew?: boolean;
  onClick: () => void;
}> = ({ icon, label, badge, isNew, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-white/75 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  >
    <span className="shrink-0 text-white/50">{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {isNew && (
      <span className="text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
        NEW
      </span>
    )}
    {badge && !isNew && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />}
  </button>
);

export default AppHeader;
