import React, { useEffect, useState } from "react";
import { BookOpen, Play, Trash2, X, Plus, Terminal } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { IconButton } from "@/components/ui/icon-button";
import { Textarea } from "@/components/ui/textarea";
import type { Script } from "../hooks/useScriptLibrary";

interface Props {
  scripts: Script[];
  loading: boolean;
  onLoad: () => void;
  onRun: (commands: string[]) => void;
  onDelete: (id: string) => void;
  onSave: (name: string, description: string, commands: string[]) => Promise<unknown>;
  onClose: () => void;
  compact?: boolean;
}

const ScriptLibraryPanel: React.FC<Props> = ({
  scripts, loading, onLoad, onRun, onDelete, onSave, onClose, compact = false,
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
  const panelTextClass = compact ? "text-[10px]" : "text-xs";
  const headerPadClass = compact ? "px-2.5 py-1.5" : "px-3 py-2";
  const cardPadClass = compact ? "px-2 py-1.5" : "px-2.5 py-2";
  const listPadClass = compact ? "px-2 py-1.5" : "px-2 py-2";
  const formSpaceClass = compact ? "space-y-1" : "space-y-1.5";
  const titleTextClass = compact ? "text-[10px]" : "text-[11px]";
  const bodyTextClass = compact ? "text-[10px]" : "text-[11px]";
  const captionTextClass = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div className={`lum-sidepanel flex flex-col h-full border-l border-white/10 ${panelTextClass}`}>
      {/* 헤더 */}
      <div className={`flex items-center gap-2 ${headerPadClass} border-b border-white/10 bg-white/[0.02] shrink-0`}>
        <BookOpen size={13} className="text-accent shrink-0" />
        <span className={`${titleTextClass} font-semibold text-white/86 flex-1`}>스크립트 라이브러리</span>
        <IconButton
          tooltip="새 스크립트 추가"
          onClick={() => setCreating((v) => !v)}
          className={`p-1 rounded border border-white/[0.1] text-white/45 hover:text-accent hover:bg-white/[0.08] transition-colors ${creating ? "text-accent border-accent/35" : ""}`}
        >
          <Plus size={12} />
        </IconButton>
        <button
          onClick={onClose}
          className="p-1 rounded border border-white/[0.1] text-white/40 hover:text-white/75 hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="닫기"
        >
          <X size={11} />
        </button>
      </div>

      {/* 새 스크립트 폼 */}
      {creating && (
        <div className={`shrink-0 border-b border-white/8 ${cardPadClass} ${formSpaceClass} bg-white/[0.03]`}>
          <input
            className={`w-full bg-white/[0.05] border border-white/[0.12] rounded-md px-2 py-1 ${bodyTextClass} text-white/84 placeholder-white/25 outline-none focus:border-accent/50`}
            placeholder="스크립트 이름"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
          />
          <input
            className={`w-full bg-white/[0.05] border border-white/[0.12] rounded-md px-2 py-1 ${bodyTextClass} text-white/56 placeholder-white/25 outline-none focus:border-accent/50`}
            placeholder="설명 (선택)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <Textarea
            className={`px-2 py-1 ${captionTextClass} font-mono text-white/60 focus:border-accent/40`}
            placeholder={"명령어를 줄마다 입력\ngit pull\nnpm install\nnpm run build"}
            rows={4}
            value={newCmds}
            onChange={e => setNewCmds(e.target.value)}
          />
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => setCreating(false)}
              className="px-2 py-1 text-[10px] text-white/44 hover:text-white/68 transition-colors"
            >
              취소
            </button>
            <button
              disabled={saving || !newName.trim() || !newCmds.trim()}
              onClick={handleCreate}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-md border border-accent/35 bg-accent/18 text-accent hover:bg-accent/30 disabled:opacity-40 transition-colors font-medium"
            >
              <Plus size={9} />
              저장
            </button>
          </div>
        </div>
      )}

      {/* 스크립트 목록 */}
      <div className={`flex-1 overflow-y-auto min-h-0 ${listPadClass} ${compact ? "space-y-1" : "space-y-1.5"}`}>
        {loading && (
          <p className={`${bodyTextClass} text-white/20 text-center py-8`}>불러오는 중…</p>
        )}
        {!loading && scripts.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20 py-12">
            <BookOpen size={24} />
            <p className={`${bodyTextClass} text-center leading-relaxed`}>
              저장된 스크립트가 없습니다.
              <br />
              + 버튼으로 스크립트를 추가하거나
              <br />
              에이전트 태스크 완료 후 저장하세요.
            </p>
          </div>
        )}
        {scripts.map((sc) => (
          <div key={sc.id} className="rounded-lg border border-white/[0.1] bg-white/[0.03] overflow-hidden">
            <div className={`flex items-start gap-2 ${cardPadClass}`}>
              <Terminal size={11} className="text-accent/68 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-white/80 ${bodyTextClass} truncate`}>{sc.name}</p>
                {sc.description && (
                  <p className={`${captionTextClass} text-white/40 truncate mt-0.5`}>{sc.description}</p>
                )}
                <p className={`${captionTextClass} text-white/30 mt-0.5`}>
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
                    className="text-white/28 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors p-1 rounded"
                    title="삭제"
                  >
                    <Trash2 size={10} />
                  </button>
                </ConfirmDeleteDialog>
                <button
                  onClick={() => onRun(sc.commands)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md border border-accent/30 bg-accent/14 text-accent hover:bg-accent/24 transition-colors font-medium"
                >
                  <Play size={9} />
                  실행
                </button>
              </div>
            </div>
            {/* 커맨드 미리보기 */}
            <div className={compact ? "px-2 pb-1" : "px-2.5 pb-2"}>
              <div className="rounded-md border border-white/[0.08] bg-black/28 px-2 py-1 space-y-0.5">
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
