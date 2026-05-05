import React, { useState } from "react";
import { Plus, Settings2, Zap } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { QuickAction } from "../hooks/useQuickActions";
import QuickActionsEditor from "./QuickActionsEditor";

interface Props {
  actions: QuickAction[];
  onExecute: (cmd: string) => void;
  onAdd: (a: Omit<QuickAction, "id">) => void;
  onUpdate: (id: string, patch: Partial<Omit<QuickAction, "id">>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

const QuickActionsBar: React.FC<Props> = ({
  actions, onExecute, onAdd, onUpdate, onDelete, onMove,
}) => {
  const [showEditor, setShowEditor] = useState(false);

  return (
    <>
      <div className="lum-quickbar flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/10 shrink-0 overflow-x-auto">
        <Zap size={12} className="text-accent/80 shrink-0 mr-0.5" />

        {actions.length === 0 && (
          <span className="text-xs text-white/38 mr-1">빠른 실행 없음 · 오른쪽 설정에서 추가</span>
        )}

        {actions.map(a => (
          <button
            key={a.id}
            onClick={() => onExecute(a.command)}
            title={a.command}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/[0.12] hover:bg-white/[0.09] hover:border-accent/35 transition-all text-xs font-medium text-white/72 hover:text-white whitespace-nowrap shrink-0 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {a.label}
            {a.shortcut != null && (
              <span className="text-[10px] text-white/36 group-hover:text-accent/80 font-mono">
                ⌘{a.shortcut}
              </span>
            )}
          </button>
        ))}

        <IconButton
          tooltip="Quick Actions 편집"
          onClick={() => setShowEditor(true)}
          className="ml-auto p-1.5 rounded-md border border-white/[0.12] text-white/45 hover:text-white/80 hover:bg-white/[0.08] transition-colors shrink-0"
        >
          {actions.length === 0
            ? <Plus size={13} />
            : <Settings2 size={13} />
          }
        </IconButton>
      </div>

      {showEditor && (
        <QuickActionsEditor
          actions={actions}
          onAdd={onAdd}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onMove={onMove}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
};

export default QuickActionsBar;
