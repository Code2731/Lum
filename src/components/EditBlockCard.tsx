import React, { useState } from "react";
import { Check, X, FileCode, Loader2, AlertTriangle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { IconButton } from "@/components/ui/icon-button";
import type { EditBlock } from "../utils/editBlockParser";
import TestResultCard from "./TestResultCard";

interface Props {
  block: EditBlock;
  cwd: string;
  /** 테스트 실패 로그를 AI 대화로 재주입 */
  onAskAIForFix?: (failureLog: string) => void;
}

type Status = "pending" | "applying" | "applied" | "rejected" | "error";

function renderActions(status: Status, onApply: () => void, onReject: () => void) {
  switch (status) {
    case "pending":
      return (
        <>
          <IconButton tooltip="파일에 변경 적용" onClick={onApply}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm transition-colors">
            <Check size={11} />
            적용
          </IconButton>
          <IconButton tooltip="건너뛰기" onClick={onReject}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 text-sm transition-colors">
            <X size={11} />
            거부
          </IconButton>
        </>
      );
    case "applying":
      return (
        <span className="flex items-center gap-1 text-accent/70 text-sm">
          <Loader2 size={11} className="animate-spin" />
          적용 중…
        </span>
      );
    case "applied":
      return (
        <span className="flex items-center gap-1 text-green-400 text-sm">
          <Check size={11} />
          적용됨
        </span>
      );
    case "rejected":
      return <span className="text-white/30 text-sm">거부됨</span>;
    case "error":
      return (
        <span className="flex items-center gap-1 text-red-400 text-sm">
          <AlertTriangle size={11} />
          실패
        </span>
      );
  }
}

const EditBlockCard: React.FC<Props> = ({ block, cwd, onAskAIForFix }) => {
  const [status, setStatus] = useState<Status>("pending");
  const [error, setError] = useState<string | null>(null);
  const [fuzzy, setFuzzy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const applyEdit = async () => {
    setStatus("applying");
    setError(null);
    try {
      const result = await invoke<{ applied: boolean; fuzzy: boolean }>("apply_edit_block", {
        cwd,
        file: block.file,
        search: block.search,
        replace: block.replace,
      });
      setStatus(result.applied ? "applied" : "error");
      setFuzzy(result.fuzzy);
    } catch (e) {
      setStatus("error");
      setError(String(e).slice(0, 200));
    }
  };

  const reject = () => setStatus("rejected");

  const searchLines = block.search.split("\n").length;
  const replaceLines = block.replace.split("\n").length;

  return (
    <div className="my-2 rounded-lg border border-accent/20 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-accent/5 border-b border-accent/10">
        <div className="flex items-center gap-2 text-xs">
          <FileCode size={13} className="text-accent/70" />
          <span className="font-mono text-accent/90">{block.file}</span>
          <span className="text-white/30 text-sm">
            −{searchLines} / +{replaceLines}
          </span>
          {fuzzy && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
              fuzzy 매치
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">{renderActions(status, applyEdit, reject)}</div>
      </div>

      {error && (
        <div className="px-3 py-1.5 text-sm text-red-400/80 border-b border-red-500/20 bg-red-500/5">
          {error}
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-1 text-left text-xs text-white/30 hover:text-white/60 hover:bg-white/[0.02] transition-colors"
      >
        {expanded ? "▼ diff 접기" : "▶ diff 펼치기"}
      </button>

      {expanded && (
        <div className="px-3 py-2 font-mono text-sm space-y-1">
          <pre className="px-2 py-1.5 rounded bg-red-500/[0.08] border border-red-500/20 text-red-300/80 overflow-x-auto whitespace-pre-wrap">
            {block.search || "(새 파일)"}
          </pre>
          <div className="text-white/20 text-center text-xs">↓</div>
          <pre className="px-2 py-1.5 rounded bg-green-500/[0.08] border border-green-500/20 text-green-300/80 overflow-x-auto whitespace-pre-wrap">
            {block.replace}
          </pre>
        </div>
      )}

      {/* 편집 적용 후 — 테스트 실행 카드 자동 표시 */}
      {status === "applied" && (
        <div className="px-3 pb-2">
          <TestResultCard cwd={cwd} autoDetect onAskAIForFix={onAskAIForFix} />
        </div>
      )}
    </div>
  );
};

export default EditBlockCard;
