import React, { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Check, X, AlertTriangle, Loader2, Wrench, ChevronDown, ChevronRight, Send, Image as ImageIcon } from "lucide-react";
import type { ToolCall } from "../utils/toolCallParser";
import { parseMcpResult } from "../utils/mcpContent";
import { formatAIErrorMessage, isCancelError } from "../utils/errorMessage";

interface Props {
  call: ToolCall;
  /** 실행 결과(텍스트)를 AI에게 재주입 (Phase 73 패턴 재사용) */
  onAskAIWithResult?: (resultSummary: string, images?: string[]) => void;
  /** 비전 모드 활성 여부 — true면 이미지 블록을 base64 data URI로 함께 전달 */
  visionEnabled?: boolean;
}

type Status = "pending" | "running" | "done" | "rejected" | "error";

const ToolCallCard: React.FC<Props> = ({ call, onAskAIWithResult, visionEnabled }) => {
  const [status, setStatus] = useState<Status>("pending");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedArgs, setExpandedArgs] = useState(false);
  const [expandedResult, setExpandedResult] = useState(false);

  const argsParseError =
    typeof call.args === "object" && call.args !== null && "_parse_error" in (call.args as object);

  const run = async () => {
    if (argsParseError) {
      setError("args JSON 파싱 실패 — AI 응답의 인용부호 확인 필요");
      setStatus("error");
      return;
    }
    setStatus("running");
    setError(null);
    try {
      const r = await invoke<unknown>("mcp_call_tool", {
        serverName: call.server,
        toolName: call.name,
        arguments: call.args,
      });
      setResult(r);
      setStatus("done");
      setExpandedResult(true);
    } catch (e) {
      if (isCancelError(e)) {
        setStatus("pending");
        setError(null);
        return;
      }
      const msg = formatAIErrorMessage(e);
      setError(msg);
      setStatus("error");
    }
  };

  const parsed = useMemo(() => (result !== null ? parseMcpResult(result) : null), [result]);

  const sendResultToAI = () => {
    if (!onAskAIWithResult || !parsed) return;

    // 비전 모드 활성 + 이미지 있음 → data URI 배열로 수집해 함께 전달
    const images =
      visionEnabled && parsed.hasImage
        ? parsed.blocks.filter((b) => b.kind === "image").map((b) => (b as { dataUri: string }).dataUri)
        : [];

    const textBody =
      parsed.hasImage && !visionEnabled
        ? `${parsed.textSummary}\n\n(이미지는 비전 모델에서만 분석 가능 — 설정에서 "비전" 활성화 + VL 모델 사용)`
        : parsed.textSummary.slice(0, 4000);

    const log = [
      `도구 \`${call.server}.${call.name}\` 실행 결과:`,
      "```",
      textBody,
      "```",
      images.length > 0 ? `\n(${images.length}개 이미지 첨부 — 비전 모델이 분석 가능)` : "",
      "",
      "이 결과를 바탕으로 분석 또는 다음 단계를 제시해 주세요.",
    ].filter(Boolean).join("\n");
    onAskAIWithResult(log, images.length > 0 ? images : undefined);
  };

  return (
    <div className="my-2 rounded-lg border border-accent/25 bg-accent/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-accent/5 border-b border-accent/10">
        <div className="flex items-center gap-2 text-xs">
          <Wrench size={12} className="text-accent/70" />
          <span className="font-mono text-accent/90">{call.server}</span>
          <span className="text-white/30">·</span>
          <span className="font-mono text-white/70">{call.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {status === "pending" && (
            <>
              <button
                onClick={run}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/20 hover:bg-accent/30 text-accent text-sm transition-colors"
              >
                <Play size={10} />
                실행
              </button>
              <button
                onClick={() => setStatus("rejected")}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 text-sm transition-colors"
              >
                <X size={10} />
                거부
              </button>
            </>
          )}
          {status === "running" && (
            <span className="flex items-center gap-1 text-accent/70 text-sm">
              <Loader2 size={11} className="animate-spin" />
              실행 중…
            </span>
          )}
          {status === "done" && (
            <span className="flex items-center gap-1 text-green-400 text-sm">
              <Check size={11} />
              완료
            </span>
          )}
          {status === "rejected" && <span className="text-white/30 text-sm">거부됨</span>}
          {status === "error" && (
            <span className="flex items-center gap-1 text-red-400 text-sm">
              <AlertTriangle size={11} />
              실패
            </span>
          )}
          {status === "error" && (
            <button
              onClick={run}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-white/80 text-sm transition-colors"
            >
              <Play size={10} />
              재실행
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 space-y-1.5 text-sm">
        <button
          onClick={() => setExpandedArgs((v) => !v)}
          className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors"
        >
          {expandedArgs ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          인자 {argsParseError && <span className="text-red-400 ml-1">⚠ JSON 파싱 실패</span>}
        </button>
        {expandedArgs && (
          <pre className="font-mono text-xs bg-black/30 border border-white/5 rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(call.args, null, 2)}
          </pre>
        )}

        {error && (
          <div className="flex items-start gap-1.5 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-red-300">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <div className="font-mono whitespace-pre-wrap break-all text-xs">{error}</div>
          </div>
        )}

        {status === "done" && parsed && (
          <>
            <button
              onClick={() => setExpandedResult((v) => !v)}
              className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors"
            >
              {expandedResult ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              결과 {parsed.hasImage && <ImageIcon size={9} className="text-accent/60 ml-0.5" />}
              <span className="text-white/25 ml-1">({parsed.blocks.length}개 블록)</span>
            </button>
            {expandedResult && (
              <div className="space-y-1.5">
                {parsed.blocks.map((b, i) => {
                  if (b.kind === "text") {
                    return (
                      <pre
                        key={i}
                        className="font-mono text-xs bg-black/30 border border-white/5 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto"
                      >
                        {b.text}
                      </pre>
                    );
                  }
                  if (b.kind === "image") {
                    return (
                      <div key={i} className="rounded border border-white/10 overflow-hidden bg-black/40">
                        <img
                          src={b.dataUri}
                          alt="MCP tool result"
                          className="max-w-full max-h-96 block"
                        />
                        <div className="px-2 py-1 text-xs text-white/30 border-t border-white/5 font-mono">
                          {b.mimeType}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <pre
                      key={i}
                      className="font-mono text-xs bg-black/30 border border-white/5 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto"
                    >
                      {JSON.stringify(b.value, null, 2)}
                    </pre>
                  );
                })}
              </div>
            )}
            {onAskAIWithResult && (
              <button
                onClick={sendResultToAI}
                className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-accent/15 hover:bg-accent/25 text-accent text-xs transition-colors"
              >
                <Send size={10} />
                {parsed.hasImage
                  ? visionEnabled
                    ? "결과를 AI에 전달 (이미지 포함)"
                    : "텍스트 요약만 AI에 전달 (비전 OFF)"
                  : "결과를 AI에게 전달"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ToolCallCard;
