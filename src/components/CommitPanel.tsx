import React, { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitCommit, Loader2, Copy, Play, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { IconButton } from "@/components/ui/icon-button";
import { Textarea } from "@/components/ui/textarea";
import { SMALL_ICON_SIZE } from "../constants/ui";

interface Props {
  model: string;
  onExecute: (command: string) => void;
  onClose: () => void;
}

export interface CommitPanelFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getCommitPanelInputFlowSummary(repoPath: string): CommitPanelFlowSummary {
  const hasRepoPath = repoPath.trim().length > 0;

  return {
    badges: [
      hasRepoPath ? "저장소 경로 입력됨" : "먼저 저장소 경로 확인",
      "다음 커밋 메시지 생성",
      "마지막 복사·실행",
    ],
    helper: hasRepoPath
      ? "저장소 위치가 준비됐습니다. AI 메시지를 생성한 뒤 내용을 다듬어 복사하거나 바로 git commit으로 이어갈 수 있습니다."
      : "저장소 위치를 먼저 확인하고 AI 메시지를 만든 뒤, 내용을 다듬어 복사하거나 바로 git commit으로 이어갑니다.",
  };
}

export function getCommitPanelMessageFlowSummary(message: string): CommitPanelFlowSummary {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const hasBody = lines.length > 1;

  return {
    badges: [
      `생성 문구 ${lines.length || 1}줄`,
      hasBody ? "다음 본문까지 검토" : "다음 제목 문구 수정",
      "마지막 복사·실행",
    ],
    helper: hasBody
      ? "생성된 제목과 본문을 먼저 읽고 필요한 문구를 수정한 뒤, 복사하거나 바로 커밋 명령으로 실행합니다."
      : "생성된 커밋 제목을 확인했습니다. 필요하면 본문을 보강하거나 문구를 다듬은 뒤 복사 또는 실행으로 이어갑니다.",
  };
}

const CommitPanel: React.FC<Props> = ({ model, onExecute, onClose }) => {
  const [repoPath, setRepoPath] = useState("");
  const [message, setMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const inputFlow = getCommitPanelInputFlowSummary(repoPath);
  const messageFlow = getCommitPanelMessageFlowSummary(message);

  function copyText(text: string) {
    navigator.clipboard?.writeText?.(text).catch(() => {});
  }

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
          <GitCommit size={SMALL_ICON_SIZE} className="text-accent shrink-0" />
          <DialogTitle className="text-xs font-semibold">AI 커밋 메시지 생성</DialogTitle>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <ActionFlowBar
              badges={inputFlow.badges}
              helper={inputFlow.helper}
              tone="neutral"
            />
          </div>
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
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 flex items-start gap-2">
              <span className="min-w-0 break-words flex-1">{error}</span>
              <IconButton
                tooltip="오류 텍스트 복사"
                description="현재 생성 실패 원인을 그대로 복사해 이슈 공유나 AI 재질문에 바로 붙여 넣을 수 있습니다."
                onClick={() => copyText(error)}
                className="p-1 rounded text-white/60 hover:text-white/85 hover:bg-red-500/20 transition-colors"
              >
                <Copy size={11} />
              </IconButton>
            </div>
          )}

          {/* AI 생성 메시지 */}
          {message && (
            <div className="space-y-2">
              <label className="text-xs text-white/40 uppercase tracking-wider">
                AI 생성 메시지
              </label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
                <ActionFlowBar
                  badges={messageFlow.badges}
                  helper={messageFlow.helper}
                  tone="neutral"
                />
              </div>
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
