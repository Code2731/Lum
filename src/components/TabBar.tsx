import React, { useCallback, useRef } from "react";
import { X, Plus, Lock, Columns2, Rows2, GitBranch, TerminalSquare, Package, Cpu, Container, Zap } from "lucide-react";
import type { Tab } from "../hooks/useTabManager";
import { TAB_COLORS } from "../hooks/useTabManager";
import * as tabIcon from "../utils/tabIcon";

interface GitTabInfo {
  branch: string;
  changed: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab | undefined;
  tabGitInfo: Record<string, GitTabInfo | null>;
  renamingTabId: string | null;
  renameValue: string;
  onSwitchTab: (id: string) => void;
  onStartRename: (id: string, title: string) => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: (id: string) => void;
  onRenameCancel: () => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onAddTab: () => void;
  onOpenSshModal: () => void;
  onToggleSplitH: () => void;
  onToggleSplitV: () => void;
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;
}

function getTabIconSummaryLabel(cwd: string): string {
  const safeCwd = typeof cwd === "string" ? cwd : "";
  const summary = tabIcon.getTabIconFlowSummary?.(safeCwd);
  if (summary && typeof summary === "object" && "secondary" in summary) {
    const secondary = (summary as { secondary?: unknown }).secondary;
    if (typeof secondary === "string" && secondary.trim()) {
      return secondary;
    }
  }

  const infer = tabIcon.inferTabIcon?.(safeCwd);
  const fallbackSummary: Record<string, string> = {
    docker: "Docker 작업공간",
    go: "Go 작업공간",
    python: "Python 작업공간",
    java: "Java 작업공간",
    rust: "Rust 작업공간",
    node: "Node 작업공간",
    git: "Git 작업공간",
    terminal: "일반 터미널",
  };

  if (infer && typeof infer === "string") {
    return fallbackSummary[infer] ?? "일반 터미널";
  }

  return "일반 터미널";
}

const TabIconComponent: React.FC<{ icon?: string }> = ({ icon }) => {
  const cls = "shrink-0";
  switch (icon) {
    case "git":     return <GitBranch size={12} className={cls} />;
    case "node":    return <Package size={12} className={cls} />;
    case "rust":    return <Zap size={12} className={cls} />;
    case "python":  return <Cpu size={12} className={cls} />;
    case "docker":  return <Container size={12} className={cls} />;
    default:        return <TerminalSquare size={12} className={cls} />;
  }
};

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  activeTab,
  tabGitInfo,
  renamingTabId,
  renameValue,
  onSwitchTab,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onCloseTab,
  onAddTab,
  onOpenSshModal,
  onToggleSplitH,
  onToggleSplitV,
  onContextMenu,
}) => {
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>, tabId: string) => {
    if (renamingTabId) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSwitchTab(tabId);
      return;
    }
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === tabId);
    let nextIdx = -1;
    if (e.key === "ArrowRight") nextIdx = idx < tabs.length - 1 ? idx + 1 : 0;
    else if (e.key === "ArrowLeft") nextIdx = idx > 0 ? idx - 1 : tabs.length - 1;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    if (nextIdx < 0 || nextIdx >= tabs.length) return;
    const nextTab = tabs[nextIdx];
    if (nextTab) {
      onSwitchTab(nextTab.id);
      tabRefs.current[nextTab.id]?.focus();
    }
  }, [tabs, renamingTabId, onSwitchTab]);

  return (
    <div className="border-b border-white/10 shrink-0">
      <div
        className="lum-tabbar flex items-center overflow-x-auto"
        role="tablist"
        aria-label="터미널 탭"
        aria-orientation="horizontal"
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => { tabRefs.current[tab.id] = el; }}
            role="tab"
            aria-selected={tab.id === activeTabId}
            aria-label={`${tab.title} 탭 · ${getTabIconSummaryLabel(tab.cwd ?? "")}`}
            tabIndex={tab.id === activeTabId ? 0 : -1}
            onClick={() => onSwitchTab(tab.id)}
            onDoubleClick={() => onStartRename(tab.id, tab.title)}
            onContextMenu={(e) => onContextMenu(e, tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-white/8 whitespace-nowrap transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-white/[0.06] ${
              tab.id === activeTabId
                ? "bg-[#182739] text-white shadow-[inset_0_-2px_0_rgba(88,166,255,0.8)]"
                : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]"
            }`}
            style={tab.color ? { borderBottom: `2px solid ${TAB_COLORS[tab.color]}` } : undefined}
          >
            {tab.color && (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: TAB_COLORS[tab.color] }}
              />
            )}
            <TabIconComponent icon={tab.icon} />
            {tab.group && (
              <span className="text-xs uppercase tracking-wider text-white/35 font-semibold">{tab.group}</span>
            )}
            {renamingTabId === tab.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={() => onRenameSubmit(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onRenameSubmit(tab.id);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onRenameCancel();
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-24 bg-transparent border-b border-accent/60 outline-none text-white text-xs"
              />
            ) : (
              <>
                {tab.sshProfile && <Lock size={11} className="text-cyan-400 shrink-0" />}
                {tab.title}
                {tabGitInfo[tab.id]?.branch && (
                  <span
                    className={`ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs ${
                      tab.id === activeTabId
                        ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-200"
                        : "border-white/15 bg-white/[0.04] text-white/60"
                    }`}
                    title={
                      tabGitInfo[tab.id]!.changed > 0
                        ? `브랜치 ${tabGitInfo[tab.id]!.branch} · 변경 ${tabGitInfo[tab.id]!.changed}개`
                        : `브랜치 ${tabGitInfo[tab.id]!.branch}`
                    }
                  >
                    <GitBranch size={10} />
                    <span>{tabGitInfo[tab.id]!.branch}</span>
                    {tabGitInfo[tab.id]!.changed > 0 && (
                      <span className="text-xs px-1 rounded bg-amber-400/22 text-amber-200">
                        {tabGitInfo[tab.id]!.changed}
                      </span>
                    )}
                  </span>
                )}
              </>
            )}
            {tabs.length > 1 && renamingTabId !== tab.id && (
              <button
                type="button"
                onClick={(e) => onCloseTab(tab.id, e)}
                className="ml-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-white transition-opacity rounded p-0.5 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`${tab.title} 닫기`}
              >
                <X size={11} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={onAddTab}
          aria-label="새 탭 (Cmd/Ctrl+T)"
          title="새 탭 (Cmd/Ctrl+T)"
          className="px-2 py-1.5 text-white/35 hover:text-white/75 hover:bg-white/5 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-white/5"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={onOpenSshModal}
          aria-label="SSH 연결 (Cmd/Ctrl+Shift+H)"
          title="SSH 연결 (Cmd/Ctrl+Shift+H)"
          className="px-2 py-1.5 text-white/35 hover:text-white/75 hover:bg-white/5 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-white/5"
        >
          <Lock size={13} />
        </button>
        <div className="ml-auto flex items-center gap-0.5 px-2 shrink-0">
          <button
            onClick={onToggleSplitH}
            aria-label="수평 분할 (Cmd/Ctrl+Shift+D)"
            aria-pressed={activeTab?.splitDir === "h"}
            title="수평 분할 (Cmd/Ctrl+Shift+D)"
            className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              activeTab?.splitDir === "h"
                ? "text-accent bg-accent/10"
                : "text-white/35 hover:text-white/75 hover:bg-white/5"
            }`}
          >
            <Columns2 size={13} />
          </button>
          <button
            onClick={onToggleSplitV}
            aria-label="수직 분할 (Cmd/Ctrl+Shift+E)"
            aria-pressed={activeTab?.splitDir === "v"}
            title="수직 분할 (Cmd/Ctrl+Shift+E)"
            className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              activeTab?.splitDir === "v"
                ? "text-accent bg-accent/10"
                : "text-white/35 hover:text-white/75 hover:bg-white/5"
            }`}
          >
            <Rows2 size={13} />
          </button>
        </div>
      </div>

    </div>
  );
};

export default TabBar;
