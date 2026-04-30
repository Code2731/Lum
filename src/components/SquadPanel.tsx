// Phase 116 — Worktree Squad 패널.
// 새 squad 생성: task 입력 → git worktree add 후 새 탭에서 그 디렉터리로 진입.
// 임베디드 mistralrs는 단일 인스턴스를 공유 — N개 squad는 ReAct를 직렬로 실행.

import React, { useState } from "react";
import { Users, Plus, Trash2, FolderOpen, GitBranch } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Squad } from "../hooks/useSquads";
import { shortPath } from "../utils";

interface Props {
  squads: Squad[];
  loading: boolean;
  error: string | null;
  currentCwd: string;
  onCreate: (task: string, baseBranch?: string) => Promise<Squad>;
  onRemove: (id: string) => Promise<void>;
  onOpenInTab: (squad: Squad) => void;
  onClose: () => void;
}

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SquadPanel: React.FC<Props> = ({
  squads,
  loading,
  error,
  currentCwd,
  onCreate,
  onRemove,
  onOpenInTab,
  onClose,
}) => {
  const [task, setTask] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!task.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const squad = await onCreate(task.trim(), baseBranch.trim() || undefined);
      setTask("");
      setBaseBranch("");
      onOpenInTab(squad);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8 shrink-0">
          <Users size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">Worktree Squad</DialogTitle>
          <span className="text-[10px] text-white/35 ml-1">병렬 작업 격리</span>
        </div>

        {/* 새 squad 생성 폼 */}
        <div className="px-5 py-4 border-b border-white/8 shrink-0 space-y-2">
          <p className="text-[10px] text-white/35">새 Squad 만들기 — 별도 git worktree + 브랜치에 격리</p>
          <Input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCreate(); } }}
            placeholder="작업 설명 (예: fix login bug)"
            disabled={creating}
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-2">
            <Input
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="베이스 브랜치 (비우면 현재 브랜치)"
              disabled={creating}
              className="h-8 text-xs flex-1"
            />
            <Button
              onClick={handleCreate}
              disabled={creating || !task.trim()}
              size="sm"
              className="h-8 gap-1.5 shrink-0"
            >
              <Plus size={12} />
              {creating ? "생성 중…" : "생성 + 새 탭"}
            </Button>
          </div>
          {currentCwd && (
            <p className="text-[10px] text-white/30 font-mono truncate">repo 위치: {shortPath(currentCwd)}</p>
          )}
          {createError && (
            <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-400/20 rounded px-2 py-1">
              {createError}
            </p>
          )}
        </div>

        {/* squad 리스트 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {loading && (
            <p className="text-xs text-white/40 text-center py-6">로딩 중…</p>
          )}
          {!loading && error && (
            <p className="text-[11px] text-red-400 text-center py-4">{error}</p>
          )}
          {!loading && !error && squads.length === 0 && (
            <p className="text-xs text-white/35 text-center py-6">활성 Squad가 없습니다.</p>
          )}

          <div className="space-y-1.5">
            {squads.map((s) => (
              <div
                key={s.id}
                className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-white/3 border border-white/7 hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-white/85 font-medium truncate">
                    <span className="truncate">{s.task}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/35">
                    <GitBranch size={9} />
                    <span className="font-mono truncate">{s.branch}</span>
                    <span>·</span>
                    <span className="font-mono truncate" title={s.worktree_path}>{shortPath(s.worktree_path)}</span>
                    <span>·</span>
                    <span>{fmtDate(s.created_at)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenInTab(s)}
                  title="새 탭에서 열기"
                  aria-label={`${s.task} squad를 새 탭에서 열기`}
                  className="p-1.5 rounded text-white/45 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <FolderOpen size={12} />
                </button>

                <ConfirmDeleteDialog
                  itemName={s.task}
                  itemType="Squad"
                  description={`worktree(${shortPath(s.worktree_path)})와 브랜치 ${s.branch}가 함께 삭제됩니다.`}
                  onConfirm={() => { onRemove(s.id); }}
                >
                  <button
                    type="button"
                    title="Squad 삭제"
                    aria-label={`${s.task} squad 삭제`}
                    className="p-1.5 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Trash2 size={12} />
                  </button>
                </ConfirmDeleteDialog>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SquadPanel;
