import React, { useState, useEffect, useRef, useCallback } from "react";
import Fuse from "fuse.js";
import { TerminalSquare, Layers, Zap, History, Search, ArrowRight } from "lucide-react";
import type { Tab } from "../hooks/useTabManager";
import type { Workspace } from "../hooks/useWorkspace";
import type { QuickAction } from "../hooks/useQuickActions";

type ItemKind = "tab" | "workspace" | "action" | "history";

interface PaletteItem {
  id: string;
  kind: ItemKind;
  label: string;
  subtitle?: string;
  onSelect: () => void;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  workspaces: Workspace[];
  quickActions: QuickAction[];
  recentHistory: string[];
  onSwitchTab: (id: string) => void;
  onRestoreWorkspace: (ws: Workspace) => void;
  onRunAction: (cmd: string) => void;
  onClose: () => void;
}

const KIND_ICON: Record<ItemKind, React.ReactNode> = {
  tab:       <TerminalSquare size={12} className="text-blue-400" />,
  workspace: <Layers size={12} className="text-purple-400" />,
  action:    <Zap size={12} className="text-yellow-400" />,
  history:   <History size={12} className="text-white/40" />,
};

const KIND_LABEL: Record<ItemKind, string> = {
  tab: "탭",
  workspace: "워크스페이스",
  action: "액션",
  history: "히스토리",
};

const CommandPalette: React.FC<Props> = ({
  tabs, activeTabId, workspaces, quickActions, recentHistory,
  onSwitchTab, onRestoreWorkspace, onRunAction, onClose,
}) => {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems: PaletteItem[] = [
    ...tabs
      .filter(t => t.id !== activeTabId)
      .map(t => ({
        id: `tab-${t.id}`,
        kind: "tab" as ItemKind,
        label: t.title,
        subtitle: t.cwd?.split("/").pop(),
        onSelect: () => { onSwitchTab(t.id); onClose(); },
      })),
    ...workspaces.map(ws => ({
      id: `ws-${ws.id}`,
      kind: "workspace" as ItemKind,
      label: ws.name,
      subtitle: `탭 ${ws.tabs.length}개`,
      onSelect: () => { onRestoreWorkspace(ws); onClose(); },
    })),
    ...quickActions.map(a => ({
      id: `action-${a.id}`,
      kind: "action" as ItemKind,
      label: a.label,
      subtitle: a.command,
      onSelect: () => { onRunAction(a.command); onClose(); },
    })),
    ...recentHistory.map((cmd, i) => ({
      id: `hist-${i}`,
      kind: "history" as ItemKind,
      label: cmd,
      onSelect: () => { onRunAction(cmd); onClose(); },
    })),
  ];

  const fuse = new Fuse(allItems, { keys: ["label", "subtitle"], threshold: 0.4 });
  const results = query.trim()
    ? fuse.search(query).map(r => r.item)
    : allItems.slice(0, 20);

  useEffect(() => { setSelected(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const confirm = useCallback(() => {
    results[selected]?.onSelect();
  }, [results, selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); confirm(); }
    if (e.key === "Escape")    { e.preventDefault(); onClose(); }
  };

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="bg-[#0d1117] border border-white/10 rounded-2xl w-[600px] max-h-[65vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
          <Search size={14} className="text-white/30 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="탭, 워크스페이스, 액션, 히스토리 검색…"
            className="flex-1 bg-transparent text-sm outline-none text-white placeholder:text-white/25"
          />
          <kbd className="text-[10px] text-white/20 border border-white/10 rounded px-1">esc</kbd>
        </div>

        {/* 결과 목록 */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="text-xs text-white/25 text-center py-8">결과 없음</p>
          ) : (
            results.map((item, i) => (
              <div
                key={item.id}
                onMouseEnter={() => setSelected(i)}
                onClick={item.onSelect}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                  i === selected ? "bg-white/6" : "hover:bg-white/3"
                }`}
              >
                <span className="shrink-0">{KIND_ICON[item.kind]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/85 truncate">{item.label}</p>
                  {item.subtitle && (
                    <p className="text-[10px] text-white/30 font-mono truncate">{item.subtitle}</p>
                  )}
                </div>
                <span className="text-[9px] text-white/20 shrink-0">{KIND_LABEL[item.kind]}</span>
                {i === selected && <ArrowRight size={10} className="text-white/30 shrink-0" />}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/6 flex gap-4 text-[10px] text-white/20">
          <span>↑↓ 이동</span>
          <span>↵ 실행</span>
          <span>esc 닫기</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
