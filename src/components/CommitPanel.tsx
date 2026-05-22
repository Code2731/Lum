import React, { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitCommit, Loader2, Copy, Play, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  model: string;
  onExecute: (command: string) => void;
  onClose: () => void;
}

const CommitPanel: React.FC<Props> = ({ model, onExecute, onClose }) => {
  const [repoPath, setRepoPath] = useState("");
  const [message, setMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pathInputRef.current?.focus();
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setMessage("");
    try {
      const msg = await invoke<string>("generate_commit_message", {
        repoPath: repoPath.trim(),
        model,
      });
      setMessage(msg);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsGenerating(false);
    }
  }, [repoPath, model]);

  const handleCopy = useCallback(() => {
    if (!message) return;
    navigator.clipboard.writeText(message).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [message]);

  const handleCommit = useCallback(() => {
    if (!message.trim()) return;
    // 첫 줄만 -m 에 넘기고, 본문이 있으면 두 번째 -m 으로 추가
    const lines = message.trim().split("\n\n");
    const title = lines[0].replace(/"/g, '\\"');
    const body = lines.slice(1).join("\n\n").replace(/"/g, '\\"');
    const cmd = body
      ? `git commit -m "${title}" -m "${body}"`
      : `git commit -m "${title}"`;
    onExecute(cmd);
    onClose();
  }, [message, onExecute, onClose]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl top-[20%] translate-y-0 gap-0 p-0 overflow-hidden border-white/10 rounded-xl">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <GitCommit size={13} className="text-accent shrink-0" />
          <DialogTitle className="text-xs font-semibold">AI 커밋 메시지 생성</DialogTitle>
        </div>

        <div className="p-4 space-y-3">
          {/* 저장소 경로 */}
          <div className="space-y-1">
            <label className="text-xs text-white/40 uppercase tracking-wider">
              저장소 경로
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <FolderOpen
                  size={11}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30"
                />
                <input
                  ref={pathInputRef}
                  className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 pl-7 text-xs font-mono outline-none focus:border-accent/50 transition-colors"
                  placeholder="/Users/you/MyProject  (비우면 홈 디렉토리)"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleGenerate();
                    }
                  }}
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 text-xs"
              >
                {isGenerating ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <GitCommit size={12} />
                )}
                분석
              </button>
            </div>
          </div>

          {/* 에러 */}
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* AI 생성 메시지 */}
          {message && (
            <div className="space-y-2">
              <label className="text-xs text-white/40 uppercase tracking-wider">
                AI 생성 메시지
              </label>
              <Textarea
                className="px-3 py-2 font-mono focus:border-accent/50"
                rows={Math.min(message.split("\n").length + 2, 10)}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/8 text-white/60 hover:bg-white/12 hover:text-white transition-colors text-xs"
                >
                  <Copy size={11} />
                  {copied ? "복사됨" : "복사"}
                </button>
                <button
                  onClick={handleCommit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors text-xs ml-auto"
                >
                  <Play size={11} />
                  git commit 실행
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommitPanel;
