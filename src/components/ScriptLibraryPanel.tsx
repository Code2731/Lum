import React, { useEffect, useState } from "react";
import { BookOpen, Play, Trash2, X, Plus, Terminal } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { IconButton } from "@/components/ui/icon-button";
import type { Script } from "../hooks/useScriptLibrary";

interface Props {
  scripts: Script[];
  loading: boolean;
  onLoad: () => void;
  onRun: (commands: string[]) => void;
  onDelete: (id: string) => void;
  onSave: (name: string, description: string, commands: string[]) => Promise<unknown>;
  onClose: () => void;
}

const ScriptLibraryPanel: React.FC<Props> = ({
  scripts, loading, onLoad, onRun, onDelete, onSave, onClose,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCmds, setNewCmds] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { onLoad(); }, [onLoad]);

  const handleCreate = async () => {
    const name = newName.trim();
    const commands = newCmds.split("\n").map(l => l.trim()).filter(Boolean);
    if (!name || commands.length === 0) return;
    setSaving(true);
    try {
      await onSave(name, newDesc.trim(), commands);
      setNewName("");
      setNewDesc("");
      setNewCmds("");
      setCreating(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-l border-white/5">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <BookOpen size={13} className="text-accent shrink-0" />
        <span className="text-[11px] font-semibold text-white/80 flex-1">스크립트 라이브러리</span>
        <IconButton
          tooltip="새 스크립트 추가"
          onClick={() => setCreating((v) => !v)}
          className={`text-white/30 hover:text-accent transition-colors p-0.5 rounded ${creating ? "text-accent" : ""}`}
        >
          <Plus size={12} />
        </IconButton>
        <button
          onClick={onClose}
          className="text-white/25 hover:text-white/60 transition-colors p-0.5 rounded"
          aria-label="닫기"
        >
          <X size={11} />
        </button>
      </div>

      {/* 새 스크립트 폼 */}
      {creating && (
        <div className="shrink-0 border-b border-white/5 p-2 space-y-1.5 bg-white/2">
          <input
            className="w-full bg-white/5 border border-white/8 rounded px-2 py-1 text-[11px] text-white/80 placeholder-white/20 outline-none focus:border-accent/40"
            placeholder="스크립트 이름"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
          />
          <input
            className="w-full bg-white/5 border border-white/8 rounded px-2 py-1 text-[11px] text-white/50 placeholder-white/20 outline-none focus:border-accent/40"
            placeholder="설명 (선택)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <textarea
            className="w-full bg-white/5 border border-white/8 rounded px-2 py-1 text-[10px] font-mono text-white/60 placeholder-white/20 outline-none focus:border-accent/40 resize-none"
            placeholder={"명령어를 줄마다 입력\ngit pull\nnpm install\nnpm run build"}
            rows={4}
            value={newCmds}
            onChange={e => setNewCmds(e.target.value)}
          />
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => setCreating(false)}
              className="px-2 py-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
            >
              취소
            </button>
            <button
              disabled={saving || !newName.trim() || !newCmds.trim()}
              onClick={handleCreate}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 transition-colors font-medium"
            >
              <Plus size={9} />
              저장
            </button>
          </div>
        </div>
      )}

      {/* 스크립트 목록 */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2 space-y-1.5">
        {loading && (
          <p className="text-[11px] text-white/20 text-center py-8">불러오는 중…</p>
        )}
        {!loading && scripts.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20 py-12">
            <BookOpen size={24} />
            <p className="text-[11px] text-center leading-relaxed">
              저장된 스크립트가 없습니다.
              <br />
              + 버튼으로 스크립트를 추가하거나
              <br />
              에이전트 태스크 완료 후 저장하세요.
            </p>
          </div>
        )}
        {scripts.map((sc) => (
          <div key={sc.id} className="rounded-lg border border-white/5 bg-white/2 overflow-hidden">
            <div className="flex items-start gap-2 px-2.5 py-2">
              <Terminal size={11} className="text-accent/50 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-white/75 truncate">{sc.name}</p>
                {sc.description && (
                  <p className="text-[10px] text-white/35 truncate mt-0.5">{sc.description}</p>
                )}
                <p className="text-[10px] text-white/25 mt-0.5">
                  {sc.commands.length}개 명령어 · {new Date(sc.created_at * 1000).toLocaleDateString("ko-KR")}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ConfirmDeleteDialog
                  itemName={sc.name}
                  itemType="스크립트"
                  description={`${sc.commands.length}개 명령어가 함께 삭제됩니다.`}
                  onConfirm={() => onDelete(sc.id)}
                >
                  <button
                    className="text-white/20 hover:text-red-400 transition-colors p-0.5 rounded"
                    title="삭제"
                  >
                    <Trash2 size={10} />
                  </button>
                </ConfirmDeleteDialog>
                <button
                  onClick={() => onRun(sc.commands)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors font-medium"
                >
                  <Play size={9} />
                  실행
                </button>
              </div>
            </div>
            {/* 커맨드 미리보기 */}
            <div className="px-2.5 pb-2">
              <div className="rounded bg-black/30 px-2 py-1 space-y-0.5">
                {sc.commands.slice(0, 3).map((cmd, i) => (
                  <p key={i} className="text-[9px] font-mono text-white/30 truncate">
                    <span className="text-white/15">$</span> {cmd}
                  </p>
                ))}
                {sc.commands.length > 3 && (
                  <p className="text-[9px] text-white/15">…+{sc.commands.length - 3}개 더</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScriptLibraryPanel;
