import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, RotateCcw, Zap, Minus, Square, X, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import Ansi from "ansi-to-react";
import CommandInput from "./components/CommandInput";

interface TerminalBlock {
  id: string;
  command: string;
  output: string;
  explanation?: string;
  analysis?: string;
  suggestion?: string;
  type: "shell" | "ai" | "error-analysis";
  status: "executing" | "completed" | "error";
  cwd: string;
  gitBranch: string | null;
}

const App = () => {
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [context, setContext] = useState<{ cwd: string; git_branch: string | null; files: string[] }>({
    cwd: "~",
    git_branch: null,
    files: [],
  });

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const currentBlockIdRef = useRef<string | null>(null);
  currentBlockIdRef.current = currentBlockId;

  const appWindow = getCurrentWindow();

  // 세션 불러오기
  useEffect(() => {
    const init = async () => {
      try {
        const savedBlocks = await invoke<TerminalBlock[]>("load_session");
        // 이전 실행 중이던 상태는 completed로 변경
        const restored = savedBlocks.map((b) => (b.status === "executing" ? { ...b, status: "completed" as const } : b));
        setBlocks(restored);
      } catch (e) {
        console.error("load session error:", e);
      }
    };
    init();
  }, []);

  // 세션 저장 (blocks 변경 시마다)
  useEffect(() => {
    if (blocks.length > 0) {
      // 실행 중인 블록이 너무 많지 않을 때만 저장 (I/O 부하 방지)
      const toSave = blocks.slice(-50).map(b => ({...b})); // 최근 50개만 저장
      invoke("save_session", { blocks: toSave }).catch(console.error);
    }
  }, [blocks]);

  // 자동 스크롤
  useEffect(() => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: blocks.length - 1, behavior: 'auto' });
    }
  }, [blocks.length]);

  // 시스템 컨텍스트 + Ollama 동기화
  useEffect(() => {
    const sync = async () => {
      try {
        const ctx = await invoke<{ cwd: string; git_branch: string | null; files: string[] }>("get_system_context");
        setContext(ctx);
      } catch (e) {
        console.error("context error:", e);
      }
      try {
        const online = await invoke<boolean>("check_ollama_status");
        setOllamaOnline(online);
        if (online) {
          const list = await invoke<string[]>("list_models");
          setModels(list);
          setSelectedModel((prev) => (prev && list.includes(prev) ? prev : list[0] || ""));
        }
      } catch (e) {
        console.error("ollama error:", e);
        setOllamaOnline(false);
      }
    };
    sync();
    const iv = setInterval(sync, 10000);
    return () => clearInterval(iv);
  }, []);

  // AI 컨텍스트 구성 도우미
  const getAiContext = useCallback(() => {
    const recentBlocks = blocks.slice(-5);
    const history = recentBlocks
      .map((b) => `Command: ${b.command}\nOutput: ${b.output.slice(0, 200)}...`)
      .join("\n\n");
    const files = context.files.join(", ");
    return `Current Directory: ${context.cwd}\nGit Branch: ${context.git_branch || "none"}\nFiles in CWD: ${files}\n\nRecent History:\n${history}`;
  }, [blocks, context]);

  const shortPath = (p: string) => {
    const parts = p.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || "~";
  };

  const handleCommand = useCallback(
    async (cmd: string, type: "shell" | "ai") => {
      const id = Date.now().toString();
      setBlocks((prev) => [
        ...prev,
        {
          id,
          command: cmd,
          output: "",
          type,
          status: "executing",
          cwd: context.cwd,
          gitBranch: context.git_branch,
        },
      ]);

      try {
        if (type === "ai") {
          const aiContext = getAiContext();
          const result = await invoke<string>("generate_ai_command", {
            prompt: cmd,
            model: selectedModel,
            context: aiContext,
          });
          try {
            // LLM이 JSON 외 텍스트를 포함할 수 있으므로 추출 시도
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            if (parsed?.command) {
              setBlocks((prev) =>
                prev.map((b) =>
                  b.id === id
                    ? {
                        ...b,
                        command: parsed.command,
                        explanation: parsed.explanation || "",
                        output: `$ ${parsed.command}`,
                        status: "completed",
                      }
                    : b
                )
              );
            } else {
              throw new Error("no command");
            }
          } catch {
            // JSON 파싱 실패 → 원문 그대로 표시
            setBlocks((prev) =>
              prev.map((b) => (b.id === id ? { ...b, output: result, status: "completed" } : b))
            );
          }
        } else {
          const prevId = currentBlockIdRef.current;
          if (prevId) {
            setBlocks((prev) =>
              prev.map((b) =>
                b.id === prevId && b.status === "executing" ? { ...b, status: "completed" } : b
              )
            );
          }
          setCurrentBlockId(id);
          await invoke("write_to_pty", { data: cmd + "\n" });
        }
      } catch (error) {
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, output: `Error: ${String(error)}`, status: "error" } : b
          )
        );
      }
    },
    [context, selectedModel, getAiContext]
  );

  const handleAnalyzeError = useCallback(
    async (block: TerminalBlock) => {
      const id = `err-${Date.now()}`;
      setBlocks((prev) => [
        ...prev,
        {
          id,
          command: `에러 분석: ${block.command}`,
          output: "",
          type: "error-analysis" as const,
          status: "executing" as const,
          cwd: block.cwd,
          gitBranch: block.gitBranch,
        },
      ]);
      try {
        const aiContext = getAiContext();
        const result = await invoke<string>("analyze_error", {
          command: block.command,
          stderr: block.output,
          model: selectedModel,
          context: aiContext,
        });
        const parsed = JSON.parse(result);
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === id
              ? { ...b, analysis: parsed.analysis, suggestion: parsed.suggestion, status: "completed" }
              : b
          )
        );
      } catch (error) {
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, output: `분석 실패: ${String(error)}`, status: "error" } : b
          )
        );
      }
    },
    [selectedModel, getAiContext]
  );

  const clearSession = useCallback(() => {
    setBlocks([]);
    invoke("save_session", { blocks: [] }).catch(console.error);
  }, []);

  return (
    <div className="app-root">
      {/* ===== 커스텀 타이틀 바 ===== */}
      <header
        className="titlebar"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button, select")) return;
          appWindow.startDragging();
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button, select")) return;
          appWindow.toggleMaximize();
        }}
      >
        <div className="titlebar-left">
          <span className="titlebar-label">{shortPath(context.cwd)}</span>
          {context.git_branch && (
            <span className="titlebar-git">
              <span className="titlebar-git-icon">⎇</span> {context.git_branch}
            </span>
          )}
        </div>
        <div className="titlebar-center">
          {ollamaOnline && models.length > 0 && (
            <select
              className="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          <div className={`status-dot ${ollamaOnline ? "online" : "offline"}`} />
        </div>
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={clearSession} title="세션 초기화">
            <Trash2 size={14} />
          </button>
          <button className="titlebar-btn" onClick={() => appWindow.minimize()}>
            <Minus size={14} />
          </button>
          <button className="titlebar-btn" onClick={() => appWindow.toggleMaximize()}>
            <Square size={11} />
          </button>
          <button className="titlebar-btn titlebar-btn-close" onClick={() => appWindow.close()}>
            <X size={14} />
          </button>
        </div>
      </header>

      {/* ===== 블록 스트림 (Virtuoso) ===== */}
      <main className="block-stream">
        {blocks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">▸</div>
            <div className="empty-state-text">LUM Terminal</div>
            <div className="empty-state-hint">명령어를 입력하세요. / 로 시작하면 AI 모드</div>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={blocks}
            initialTopMostItemIndex={blocks.length - 1}
            itemContent={(index, block) => (
              <div key={block.id} className="block">
                {/* 프롬프트 */}
                <div className="block-header">
                  <span className="prompt-arrow">➜</span>
                  <span className="prompt-path">{shortPath(block.cwd)}</span>
                  {block.gitBranch && (
                    <span className="prompt-git">
                      git:(<span className="prompt-git-branch">{block.gitBranch}</span>)
                    </span>
                  )}
                  <span className="prompt-cmd">{block.command}</span>

                  {block.status === "executing" && <span className="status-executing">●</span>}

                  {/* hover 액션 */}
                  <div className="block-actions">
                    <button
                      className="block-action-btn"
                      onClick={() => navigator.clipboard.writeText(block.output)}
                      title="복사"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      className="block-action-btn"
                      onClick={() => handleCommand(block.command, "shell")}
                      title="재실행"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </div>

                {/* AI 설명 */}
                {block.explanation && <div className="block-explanation">{block.explanation}</div>}

                {/* 에러 분석 */}
                {block.analysis && (
                  <div className="block-analysis">
                    <div className="analysis-body">
                      <span className="analysis-label">진단</span>
                      {block.analysis}
                    </div>
                    {block.suggestion && (
                      <button
                        className="analysis-fix"
                        onClick={() => handleCommand(block.suggestion!, "shell")}
                      >
                        <code>{block.suggestion}</code>
                        <span className="analysis-fix-label">적용</span>
                      </button>
                    )}
                  </div>
                )}

                {/* 출력 */}
                {(block.output || block.status === "executing") && (
                  <div className="block-output">
                    <Ansi>{block.output}</Ansi>
                  </div>
                )}

                {/* 에러 AI 분석 버튼 */}
                {block.type === "shell" &&
                  block.status === "completed" &&
                  block.output.toLowerCase().includes("error") &&
                  !block.analysis && (
                    <button className="error-analyze-btn" onClick={() => handleAnalyzeError(block)}>
                      <Zap size={12} />
                      AI 에러 분석
                    </button>
                  )}
              </div>
            )}
          />
        )}
      </main>

      {/* ===== 하단 에디터 ===== */}
      <CommandInput
        onCommandSubmit={handleCommand}
        selectedModel={selectedModel}
        context={context}
        ollamaOnline={ollamaOnline}
      />
    </div>
  );
};

export default App;
