import React from "react";
import { TerminalSquare, Layers, Zap, History } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import type { Tab } from "../hooks/useTabManager";
import type { Workspace } from "../hooks/useWorkspace";
import type { QuickAction } from "../hooks/useQuickActions";
import { shortPath } from "../utils";

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

const CommandPalette: React.FC<Props> = ({
  tabs, activeTabId, workspaces, quickActions, recentHistory,
  onSwitchTab, onRestoreWorkspace, onRunAction, onClose,
}) => {
  const otherTabs = tabs.filter((t) => t.id !== activeTabId);

  return (
    <CommandDialog open onOpenChange={(o) => { if (!o) onClose(); }} title="커맨드 팔레트">
      <CommandInput placeholder="탭, 워크스페이스, 액션, 히스토리 검색…" />
      <CommandList>
        <CommandEmpty>결과 없음</CommandEmpty>

        {otherTabs.length > 0 && (
          <CommandGroup heading="탭">
            {otherTabs.map((t) => (
              <CommandItem
                key={`tab-${t.id}`}
                value={`tab ${t.title} ${t.cwd ?? ""}`}
                onSelect={() => { onSwitchTab(t.id); onClose(); }}
              >
                <TerminalSquare size={12} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white/85 truncate">{t.title}</p>
                  {t.cwd && (
                    <p className="text-xs text-white/30 font-mono truncate">{shortPath(t.cwd)}</p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {workspaces.length > 0 && (
          <CommandGroup heading="워크스페이스">
            {workspaces.map((ws) => (
              <CommandItem
                key={`ws-${ws.id}`}
                value={`workspace ${ws.name}`}
                onSelect={() => { onRestoreWorkspace(ws); onClose(); }}
              >
                <Layers size={12} className="text-purple-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white/85 truncate">{ws.name}</p>
                  <p className="text-xs text-white/30 truncate">탭 {ws.tabs.length}개</p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {quickActions.length > 0 && (
          <CommandGroup heading="빠른 액션">
            {quickActions.map((a) => (
              <CommandItem
                key={`action-${a.id}`}
                value={`action ${a.label} ${a.command}`}
                onSelect={() => { onRunAction(a.command); onClose(); }}
              >
                <Zap size={12} className="text-yellow-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white/85 truncate">{a.label}</p>
                  <p className="text-xs text-white/30 font-mono truncate">{a.command}</p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {recentHistory.length > 0 && (
          <CommandGroup heading="히스토리">
            {recentHistory.map((cmd, i) => (
              <CommandItem
                key={`hist-${i}`}
                value={`history ${cmd}`}
                onSelect={() => { onRunAction(cmd); onClose(); }}
              >
                <History size={12} className="text-white/40 shrink-0" />
                <p className="text-white/85 font-mono truncate flex-1">{cmd}</p>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;
