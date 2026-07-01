import React, { useState } from "react";
import { Layers, Save, Trash2, FolderOpen, TerminalSquare, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { focusMainInput } from "@/utils/focus";
import type { Workspace, WorkspaceTab } from "../hooks/useWorkspace";
import { shortPath } from "../utils";

interface Props {
  currentTabs: WorkspaceTab[];
  activeTabId: string;
  workspaces: Workspace[];
  loading: boolean;
  onSave: (name: string) => Promise<void>;
  onRestore: (ws: Workspace) => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

function fmtDate(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const WorkspacePanel: React.FC<Props> = ({
  currentTabs, activeTabId, workspaces, loading,
  onSave, onRestore, onDelete, onClose,
}) => {
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const name = saveName.trim() || `워크스페이스 ${new Date().toLocaleDateString("ko-KR")}`;
    setSaving(true);
    try { await onSave(name); setSaveName(""); } finally { setSaving(false); }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[580px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusMainInput();
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8 shrink-0">
          <Layers size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">워크스페이스</DialogTitle>
        </div>

        {/* 현재 세션 저장 */}
        <div className="px-5 py-4 border-b border-white/8 shrink-0">
          <p className="text-xs text-white/35 mb-2">현재 세션 저장</p>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/3 border border-white/7 rounded-xl px-3 py-2">
              <div className="flex gap-1 flex-wrap mb-2">
                {currentTabs.map(t => (
                  <span
                    key={t.id}
                    className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md ${
                      t.id === activeTabId ? "bg-accent/15 text-accent" : "bg-white/5 text-white/40"
                    }`}
                  >
                    <TerminalSquare size={8} />
                    {t.title}
                    {t.cwd && <span className="text-white/25 font-mono truncate max-w-[80px]">{shortPath(t.cwd)}</span>}
                  </span>
                ))}
              </div>
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSave();
                  }
                }}
                placeholder={`워크스페이스 이름 (기본: 날짜)`}
                className="w-full bg-transparent text-xs outline-none text-white/70 placeholder:text-white/20"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 transition-colors text-xs font-medium shrink-0"
            >
              <Save size={12} /> 저장
            </button>
          </div>
        </div>

        {/* 저장된 워크스페이스 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0">
          {loading && (
            <p className="text-xs text-white/25 text-center py-6">불러오는 중…</p>
          )}
          {!loading && workspaces.length === 0 && (
            <p className="text-xs text-white/25 text-center py-8">저장된 워크스페이스가 없습니다</p>
          )}
          {workspaces.map(ws => (
            <div key={ws.id} className="border border-white/7 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                <Layers size={12} className="text-accent/60 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 truncate">{ws.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={9} className="text-white/20" />
                    <span className="text-xs text-white/30">{fmtDate(ws.created_at)}</span>
                    <span className="text-xs text-white/20 ml-1">탭 {ws.tabs.length}개</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { onRestore(ws); onClose(); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors text-xs font-medium"
                  >
                    <FolderOpen size={10} /> 불러오기
                  </button>
                  <ConfirmDeleteDialog
                    itemName={ws.name}
                    itemType="워크스페이스"
                    description={`탭 ${ws.tabs.length}개가 함께 삭제됩니다.`}
                    onConfirm={() => onDelete(ws.id)}
                  >
                    <button className="p-1 rounded text-white/20 hover:text-red-400 transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </ConfirmDeleteDialog>
                </div>
              </div>
              {/* 탭 미리보기 */}
              <div className="flex gap-1 px-4 pb-2.5 flex-wrap">
                {ws.tabs.map(t => (
                  <span
                    key={t.id}
                    className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-white/4 text-white/35"
                  >
                    <TerminalSquare size={7} />
                    {t.title}
                    {t.cwd && <span className="font-mono text-white/20 truncate max-w-[60px]">{shortPath(t.cwd)}</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkspacePanel;
