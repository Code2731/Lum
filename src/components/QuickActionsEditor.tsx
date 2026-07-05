import React, { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { QuickAction } from "../hooks/useQuickActions";

interface Props {
  actions: QuickAction[];
  onAdd: (a: Omit<QuickAction, "id">) => void;
  onUpdate: (id: string, patch: Partial<Omit<QuickAction, "id">>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onClose: () => void;
}

const SHORTCUT_OPTIONS = [
  { label: "없음", value: undefined },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ label: `Cmd/Ctrl+${n}`, value: n })),
];

const QuickActionsEditor: React.FC<Props> = ({
  actions, onAdd, onUpdate, onDelete, onMove, onClose,
}) => {
  const [newLabel, setNewLabel] = useState("");
  const [newCmd, setNewCmd] = useState("");
  const [newShortcut, setNewShortcut] = useState<number | undefined>(undefined);

  const handleAdd = () => {
    if (!newLabel.trim() || !newCmd.trim()) return;
    onAdd({ label: newLabel.trim(), command: newCmd.trim(), shortcut: newShortcut });
    setNewLabel("");
    setNewCmd("");
    setNewShortcut(undefined);
  };

  const usedShortcuts = new Set(actions.map(a => a.shortcut).filter(Boolean));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-2xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8 shrink-0">
          <Zap size={14} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">빠른 액션 편집</DialogTitle>
        </div>

        {/* 액션 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0">
          {actions.length === 0 && (
            <p className="text-xs text-white/25 text-center py-6">아직 등록된 액션이 없습니다</p>
          )}

          {actions.map((a, idx) => (
            <div
              key={a.id}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-white/3 border border-white/6 group"
            >
              {/* 순서 버튼 */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => onMove(a.id, -1)}
                  disabled={idx === 0}
                  className="p-0.5 rounded text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors"
                >
                  <ChevronUp size={10} />
                </button>
                <button
                  onClick={() => onMove(a.id, 1)}
                  disabled={idx === actions.length - 1}
                  className="p-0.5 rounded text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors"
                >
                  <ChevronDown size={10} />
                </button>
              </div>

              <Input value={a.label} onChange={e => onUpdate(a.id, { label: e.target.value })}
                placeholder="이름" className="w-24 shrink-0 px-2 py-1" />
              <Input value={a.command} onChange={e => onUpdate(a.id, { command: e.target.value })}
                placeholder="실행할 커맨드" className="flex-1 px-2 py-1 font-mono" />

              <Select
                value={a.shortcut != null ? String(a.shortcut) : ""}
                onValueChange={v => onUpdate(a.id, { shortcut: v !== "" ? Number(v) : undefined })}
              >
                <SelectTrigger className="w-16 shrink-0 py-1 text-xs justify-center">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHORTCUT_OPTIONS.map(o => (
                    <SelectItem key={String(o.value)} value={o.value != null ? String(o.value) : ""} disabled={o.value != null && usedShortcuts.has(o.value) && a.shortcut !== o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 삭제 */}
              <IconButton
                tooltip="삭제"
                confirm={{
                  title: "빠른 액션 삭제",
                  description: <><span className="font-medium text-white/85">"{a.label}"</span> 액션이 삭제됩니다.</>,
                }}
                onClick={() => onDelete(a.id)}
                className="p-1 rounded text-white/20 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
        </div>

        {/* 새 액션 추가 */}
        <div className="px-5 py-4 border-t border-white/8 shrink-0">
          <p className="text-xs text-white/30 mb-2">새 액션 추가</p>
          <div className="flex items-center gap-2">
            <Input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAdd();
                }
              }}
              placeholder="이름" className="w-24 shrink-0 px-2" />
            <Input value={newCmd} onChange={e => setNewCmd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAdd();
                }
              }}
              placeholder="실행할 커맨드 (예: npm run dev)" className="flex-1 px-2 font-mono" />
            <Select
              value={newShortcut != null ? String(newShortcut) : ""}
              onValueChange={v => setNewShortcut(v !== "" ? Number(v) : undefined)}
            >
              <SelectTrigger className="w-16 shrink-0 py-1.5 text-xs justify-center">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHORTCUT_OPTIONS.map(o => (
                  <SelectItem key={String(o.value)} value={o.value != null ? String(o.value) : ""} disabled={o.value != null && usedShortcuts.has(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={handleAdd}
              disabled={!newLabel.trim() || !newCmd.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 transition-colors text-xs font-medium shrink-0"
            >
              <Plus size={11} /> 추가
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickActionsEditor;
