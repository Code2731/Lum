import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, CheckCircle2, XCircle, Loader2, Clock, RefreshCw, Send } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

interface TestCommand {
  command: string;
  project_type: string;
  detected_via: string;
}

interface TestResult {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
  passed: boolean;
  timed_out: boolean;
}

interface Props {
  cwd: string;
  /** 적용된 파일이 있을 때 — 자동 감지. 사용자가 안 누르면 표시만 */
  autoDetect?: boolean;
  /** 실패 시 AI에 실패 로그 재주입하는 콜백 (Chat으로 전송) */
  onAskAIForFix?: (failureLog: string) => void;
}

const TestResultCard: React.FC<Props> = ({ cwd, autoDetect = true, onAskAIForFix }) => {
  const [detected, setDetected] = useState<TestCommand | null>(null);
  const [loadingDetect, setLoadingDetect] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  React.useEffect(() => {
    if (!autoDetect || !cwd) return;
    setLoadingDetect(true);
    invoke<TestCommand | null>("detect_project_tests", { cwd })
      .then((d) => setDetected(d))
      .catch(() => setDetected(null))
      .finally(() => setLoadingDetect(false));
  }, [cwd, autoDetect]);

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await invoke<TestResult>("run_tests", { cwd, command: null, timeoutSecs: 120 });
      setResult(r);
      if (!r.passed) setExpanded(true);
    } catch (e) {
      setResult({
        command: detected?.command ?? "?",
        stdout: "",
        stderr: String(e).slice(0, 500),
        exit_code: null,
        duration_ms: 0,
        passed: false,
        timed_out: false,
      });
      setExpanded(true);
    } finally {
      setRunning(false);
    }
  };

  const askAIForFix = () => {
    if (!result || result.passed || !onAskAIForFix) return;
    const log = [
      `테스트가 실패했습니다. 커맨드: \`${result.command}\``,
      `exit code: ${result.exit_code ?? "timeout"}`,
      `소요 시간: ${(result.duration_ms / 1000).toFixed(1)}s`,
      "",
      "## stderr (마지막 8KB)",
      "```",
      result.stderr || "(없음)",
      "```",
      "## stdout (마지막 8KB)",
      "```",
      result.stdout || "(없음)",
      "```",
      "",
      "실패 원인을 분석하고 수정 SEARCH/REPLACE 블록을 제시해 주세요.",
    ].join("\n");
    onAskAIForFix(log);
  };

  if (loadingDetect) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/40 px-3 py-2 bg-white/3 rounded">
        <Loader2 size={11} className="animate-spin" />
        프로젝트 테스트 감지 중…
      </div>
    );
  }

  if (!detected) {
    return (
      <div className="text-[11px] text-white/30 px-3 py-2 bg-white/3 rounded">
        이 폴더에서 테스트 커맨드를 찾지 못했습니다 (package.json/Cargo.toml/pyproject.toml/go.mod 없음).
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-white/3 border-b border-white/5">
        <div className="flex items-center gap-2 text-[11px]">
          <Play size={11} className="text-accent/70" />
          <span className="text-white/70">테스트 실행</span>
          <code className="px-1.5 py-0.5 bg-black/30 rounded font-mono text-[10px] text-accent/80">
            {detected.command}
          </code>
          <span className="text-white/25 text-[9px]">
            ({detected.project_type} · {detected.detected_via})
          </span>
        </div>
        {!running && !result && (
          <button
            onClick={runTest}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/15 hover:bg-accent/25 text-accent text-[11px] transition-colors"
          >
            <Play size={10} />
            실행
          </button>
        )}
        {running && (
          <span className="flex items-center gap-1 text-accent/70 text-[11px]">
            <Loader2 size={11} className="animate-spin" />
            실행 중…
          </span>
        )}
        {result && (
          <IconButton
            tooltip="다시 실행"
            onClick={runTest}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 text-[11px] transition-colors"
          >
            <RefreshCw size={10} />
          </IconButton>
        )}
      </div>

      {result && (
        <>
          <div
            className={`flex items-center justify-between px-3 py-2 text-[11px] cursor-pointer hover:bg-white/3 transition-colors ${
              result.passed ? "text-green-400" : "text-red-400"
            }`}
            onClick={() => setExpanded((v) => !v)}
          >
            <div className="flex items-center gap-2">
              {result.passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              <span className="font-medium">
                {result.passed ? "통과" : result.timed_out ? "타임아웃" : "실패"}
              </span>
              {result.exit_code !== null && (
                <span className="text-white/30 font-mono text-[10px]">
                  exit {result.exit_code}
                </span>
              )}
              <span className="flex items-center gap-1 text-white/30 text-[10px]">
                <Clock size={9} />
                {(result.duration_ms / 1000).toFixed(1)}s
              </span>
            </div>
            <span className="text-[10px] text-white/40">
              {expanded ? "▼ 접기" : "▶ 출력 보기"}
            </span>
          </div>

          {expanded && (
            <div className="px-3 py-2 space-y-2 border-t border-white/5">
              {result.stderr && (
                <div>
                  <div className="text-[9px] text-red-400/60 uppercase tracking-wide mb-1">
                    stderr
                  </div>
                  <pre className="text-[11px] text-red-300/85 bg-red-500/5 border border-red-500/20 rounded p-2 font-mono overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {result.stderr}
                  </pre>
                </div>
              )}
              {result.stdout && (
                <div>
                  <div className="text-[9px] text-white/30 uppercase tracking-wide mb-1">
                    stdout
                  </div>
                  <pre className="text-[11px] text-white/70 bg-black/30 border border-white/5 rounded p-2 font-mono overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {result.stdout}
                  </pre>
                </div>
              )}
              {!result.stdout && !result.stderr && (
                <div className="text-[10px] text-white/30 italic">(출력 없음)</div>
              )}
              {!result.passed && onAskAIForFix && (
                <button
                  onClick={askAIForFix}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-accent/15 hover:bg-accent/25 text-accent text-[11px] transition-colors"
                >
                  <Send size={11} />
                  🔄 AI에게 수정 요청 (실패 로그 재주입)
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TestResultCard;
