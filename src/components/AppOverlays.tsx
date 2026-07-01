// Phase 126 — App.tsx 분해 2차: 전역 모달/패널 모음.
// 13개 조건부 렌더 모달을 한 곳에 묶어 App.tsx 가독성 회복.
// state는 App.tsx가 소유, 여기는 props로 받아 렌더만.

import React, { lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import HistorySearch from "./HistorySearch";
import CommitPanel from "./CommitPanel";
import ThemePanel from "./ThemePanel";
import WorkspacePanel from "./WorkspacePanel";
import CommandPalette from "./CommandPalette";
import TabContextMenu from "./TabContextMenu";
import WelcomeHints from "./WelcomeHints";
import SshConnectModal from "./SshConnectModal";
import { ErrorBoundary } from "./ErrorBoundary";
import type { usePanelVisibility } from "../hooks/usePanelVisibility";
import type { useSquads } from "../hooks/useSquads";
import type { useAIChat } from "../hooks/useAIChat";
import type { useTerminalTheme } from "../hooks/useTerminalTheme";
import type { useWorkspace, Workspace } from "../hooks/useWorkspace";
import type { useQuickActions } from "../hooks/useQuickActions";
import type { Tab, SshProfile, TabColor } from "../hooks/useTabManager";
import { focusMainInput } from "@/utils/focus";

const ReactAgentPanel = lazy(() => import("./ReactAgentPanel"));
const ModelManager = lazy(() => import("./ModelManager"));
const XllmPanel = lazy(() => import("./XllmPanel"));
const OnboardingWizard = lazy(() => import("./OnboardingWizard"));
const DiffReviewPanel = lazy(() => import("./DiffReviewPanel"));
const McpPanel = lazy(() => import("./McpPanel"));
const SquadPanel = lazy(() => import("./SquadPanel"));
const HealingDatasetPanel = lazy(() => import("./HealingDatasetPanel"));
const HistoryGraphPanel = lazy(() => import("./HistoryGraphPanel").then(m => ({ default: m.HistoryGraphPanel })));
const RecallPanel = lazy(() => import("./RecallPanel"));
const LoraForgePanel = lazy(() => import("./LoraForgePanel"));
const SkillsPanel = lazy(() => import("./SkillsPanel"));

void ReactAgentPanel; // App.tsx에서 직접 lazy import — 여기선 미사용이지만 모듈 사이드이펙트 통일

interface Props {
  panels: ReturnType<typeof usePanelVisibility>;
  selectedModel: string;
  // chat
  aiChat: ReturnType<typeof useAIChat>;
  // squad
  squadStore: ReturnType<typeof useSquads>;
  resetHealing: () => void;
  addTab: (opts?: { cwd?: string; title?: string }) => void;
  // tabs (for context menu, palette, squad cwd)
  tabs: Tab[];
  activeTabId: string;
  activeTabIdRef: React.RefObject<string | null>;
  // theme
  appearance: ReturnType<typeof useTerminalTheme>["appearance"];
  saveAppearance: ReturnType<typeof useTerminalTheme>["saveAppearance"];
  // workspace
  workspaces: ReturnType<typeof useWorkspace>["workspaces"];
  wsTabs: {
    id: string;
    title: string;
    cwd: string;
    split_dir: "h" | "v" | undefined;
    split_cwd?: string;
  }[];
  wsLoading: boolean;
  saveWorkspace: ReturnType<typeof useWorkspace>["saveWorkspace"];
  deleteWorkspace: ReturnType<typeof useWorkspace>["deleteWorkspace"];
  handleRestoreWorkspace: (ws: Workspace) => void;
  // command palette
  quickActions: ReturnType<typeof useQuickActions>["actions"];
  recentCmds: string[];
  switchTabWithReset: (tabId: string) => void;
  ptyWriteRefs: React.MutableRefObject<Map<string, (data: string) => void>>;
  activePaneIdRef: React.RefObject<string>;
  // history & commit
  handleHistorySelect: (command: string) => void;
  handleCommitExecute: (cmd: string) => void;
  // tab context menu
  tabCtxMenu: { tabId: string; x: number; y: number } | null;
  setTabCtxMenu: (v: { tabId: string; x: number; y: number } | null) => void;
  contextTab: Tab | undefined;
  updateTabColor: (tabId: string, color: TabColor | undefined) => void;
  updateTabGroup: (tabId: string, group: string | undefined) => void;
  // ssh
  handleSshConnect: (profile: SshProfile) => void;
  // welcome
  showWelcome: boolean;
  setShowWelcome: (v: boolean) => void;
  // onboarding (locally tracked)
  showOnboarding: boolean;
  setShowOnboarding: (v: boolean) => void;
}

const AppOverlays: React.FC<Props> = ({
  panels, selectedModel, aiChat, squadStore, resetHealing, addTab,
  tabs, activeTabId, activeTabIdRef,
  appearance, saveAppearance,
  workspaces, wsTabs, wsLoading, saveWorkspace, deleteWorkspace, handleRestoreWorkspace,
  quickActions, recentCmds, switchTabWithReset, ptyWriteRefs, activePaneIdRef,
  handleHistorySelect, handleCommitExecute,
  tabCtxMenu, setTabCtxMenu, contextTab, updateTabColor, updateTabGroup,
  handleSshConnect,
  showWelcome, setShowWelcome,
  showOnboarding, setShowOnboarding,
}) => {
  const {
    showModelManager, setShowModelManager,
    showHistorySearch, setShowHistorySearch,
    showCommitPanel, setShowCommitPanel,
    showXllmPanel, setShowXllmPanel,
    showMcpPanel, setShowMcpPanel,
    showHealingDataset, setShowHealingDataset,
    showHistoryGraph, setShowHistoryGraph,
    showRecall, setShowRecall,
    showLoraForge, setShowLoraForge,
    showSkills, setShowSkills,
    showSquadPanel, setShowSquadPanel,
    showDiffReview, setShowDiffReview,
    showThemePanel, setShowThemePanel,
    showWorkspace, setShowWorkspace,
    showPalette, setShowPalette,
    showSshModal, setShowSshModal,
  } = panels;

  const restoreMainInputFocus = () => {
    focusMainInput();
  };

  const closeWithFocus = (close: () => void) => {
    close();
    restoreMainInputFocus();
  };

  return (
    <>
      {showModelManager && (
        <Suspense fallback={null}>
          <ModelManager onClose={() => closeWithFocus(() => setShowModelManager(false))} />
        </Suspense>
      )}

      {showHistorySearch && (
        <HistorySearch
          model={selectedModel}
          onSelect={handleHistorySelect}
          onClose={() => {
            setShowHistorySearch(false);
            restoreMainInputFocus();
          }}
        />
      )}

      {showCommitPanel && (
        <ErrorBoundary label="커밋">
          <CommitPanel
            model={selectedModel}
            onExecute={handleCommitExecute}
            onClose={() => closeWithFocus(() => setShowCommitPanel(false))}
          />
        </ErrorBoundary>
      )}

      {showXllmPanel && (
        <Suspense fallback={null}>
          <ErrorBoundary label="xLLM">
            <XllmPanel onClose={() => closeWithFocus(() => setShowXllmPanel(false))} />
          </ErrorBoundary>
        </Suspense>
      )}

      {showMcpPanel && (
        <Suspense fallback={null}>
          <ErrorBoundary label="MCP">
            <McpPanel onClose={() => closeWithFocus(() => setShowMcpPanel(false))} />
          </ErrorBoundary>
        </Suspense>
      )}

      {showHealingDataset && (
        <Suspense fallback={null}>
          <ErrorBoundary label="Auto-Heal 데이터셋">
            <HealingDatasetPanel onClose={() => closeWithFocus(() => setShowHealingDataset(false))} />
          </ErrorBoundary>
        </Suspense>
      )}

      {showHistoryGraph && (
        <Suspense fallback={null}>
          <ErrorBoundary label="히스토리 그래프">
            <HistoryGraphPanel onClose={() => closeWithFocus(() => setShowHistoryGraph(false))} />
          </ErrorBoundary>
        </Suspense>
      )}

      {showRecall && (
        <Suspense fallback={null}>
          <ErrorBoundary label="메모리 검색">
            <RecallPanel
              model={selectedModel}
              onInjectToChat={(text) => { aiChat.sendMessage(`다음 과거 컨텍스트를 참고해서 답해줘:\n\n${text}`); setShowRecall(false); }}
              onClose={() => closeWithFocus(() => setShowRecall(false))}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {showSkills && (
        <Suspense fallback={null}>
          <ErrorBoundary label="Skills">
            <SkillsPanel onClose={() => closeWithFocus(() => setShowSkills(false))} />
          </ErrorBoundary>
        </Suspense>
      )}

      {showLoraForge && (
        <Suspense fallback={null}>
          <ErrorBoundary label="LoRA Forge">
            <LoraForgePanel
              onLoadAdapter={(run) => {
                aiChat.sendMessage(
                  `이 LoRA 어댑터를 추론 모델에 적용해줘. 출력 디렉터리: ${run.output_dir}`,
                );
                setShowLoraForge(false);
              }}
              onRevealPath={async (path) => {
                try {
                  const { openPath } = await import("@tauri-apps/plugin-opener");
                  await openPath(path);
                } catch {
                  /* noop */
                }
              }}
              onClose={() => closeWithFocus(() => setShowLoraForge(false))}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {showSquadPanel && (
        <Suspense fallback={null}>
          <ErrorBoundary label="Squad">
            <SquadPanel
              squads={squadStore.squads}
              loading={squadStore.loading}
              error={squadStore.error}
              currentCwd={tabs.find((t) => t.id === activeTabId)?.cwd ?? ""}
              onCreate={async (task, baseBranch) => {
                const cwd = tabs.find((t) => t.id === activeTabIdRef.current)?.cwd ?? "";
                return squadStore.create(task, cwd, baseBranch);
              }}
              onRemove={squadStore.remove}
              onOpenInTab={(squad) => {
                resetHealing();
                addTab({ cwd: squad.worktree_path, title: `🛡 ${squad.task.slice(0, 18)}` });
                setShowSquadPanel(false);
              }}
              onClose={() => closeWithFocus(() => setShowSquadPanel(false))}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {showDiffReview && (
        <Suspense fallback={null}>
          <ErrorBoundary label="Diff 리뷰">
            <DiffReviewPanel
              model={selectedModel}
              onClose={() => closeWithFocus(() => setShowDiffReview(false))}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {showThemePanel && (
        <ThemePanel
          appearance={appearance}
          onSave={saveAppearance}
          onClose={() => closeWithFocus(() => setShowThemePanel(false))}
        />
      )}

      {showWorkspace && (
        <WorkspacePanel
          currentTabs={wsTabs}
          activeTabId={activeTabId}
          workspaces={workspaces}
          loading={wsLoading}
          onSave={async name => { await saveWorkspace(name, wsTabs, activeTabId); }}
          onRestore={handleRestoreWorkspace}
          onDelete={deleteWorkspace}
          onClose={() => {
            setShowWorkspace(false);
            restoreMainInputFocus();
          }}
        />
      )}

      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingWizard onComplete={() => {
            setShowOnboarding(false);
            restoreMainInputFocus();
          }} />
        </Suspense>
      )}

      {showPalette && (
        <CommandPalette
          tabs={tabs}
          activeTabId={activeTabId}
          workspaces={workspaces}
          quickActions={quickActions}
          recentHistory={recentCmds}
          onSwitchTab={switchTabWithReset}
          onRestoreWorkspace={handleRestoreWorkspace}
          onRunAction={cmd => {
            ptyWriteRefs.current.get(activePaneIdRef.current ?? "")?.(cmd + "\r");
          }}
          onClose={() => {
            setShowPalette(false);
            restoreMainInputFocus();
          }}
        />
      )}

      {tabCtxMenu && (
        <TabContextMenu
          tabId={tabCtxMenu.tabId}
          currentColor={contextTab?.color}
          currentGroup={contextTab?.group}
          x={tabCtxMenu.x}
          y={tabCtxMenu.y}
          onSetColor={updateTabColor}
          onSetGroup={updateTabGroup}
          onClose={() => setTabCtxMenu(null)}
        />
      )}

      {showSshModal && (
        <SshConnectModal
          onConnect={handleSshConnect}
          onClose={() => {
            setShowSshModal(false);
            restoreMainInputFocus();
          }}
        />
      )}

      {showWelcome && (
        <WelcomeHints
          onClose={() => {
            setShowWelcome(false);
            invoke("save_ui_preferences", { hintsShown: true }).catch(() => {});
            restoreMainInputFocus();
          }}
        />
      )}
    </>
  );
};

export default AppOverlays;
