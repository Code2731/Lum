import React, { useState } from "react";
import { Plus, Settings2, Zap } from "lucide-react";
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
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5 bg-[#0a0e13] shrink-0 overflow-x-auto">
        <Zap size={10} className="text-accent/50 shrink-0 mr-0.5" />

        {actions.length === 0 && (
          <span className="text-[10px] text-white/20 mr-1">빠른 실행 없음 — 오른쪽 ⚙️ 버튼으로 추가</span>
        )}

        {actions.map(a => (
          <button
            key={a.id}
            onClick={() => onExecute(a.command)}
            title={a.command}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/4 border border-white/7 hover:bg-white/8 hover:border-accent/30 transition-all text-[11px] text-white/60 hover:text-white whitespace-nowrap shrink-0 group"
          >
            {a.label}
            {a.shortcut != null && (
              <span className="text-[9px] text-white/20 group-hover:text-accent/60 font-mono">
                ⌘{a.shortcut}
              </span>
            )}
          </button>
        ))}

        <button
          onClick={() => setShowEditor(true)}
          title="Quick Actions 편집"
          className="ml-auto p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/5 transition-colors shrink-0"
        >
          {actions.length === 0
            ? <Plus size={11} />
            : <Settings2 size={11} />
          }
        </button>
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
