import { useState, useRef, useEffect } from "react";
import { Zap } from "lucide-react";

interface Props {
  onCommandSubmit: (cmd: string, type: "shell" | "ai") => void;
  selectedModel: string;
  ollamaOnline: boolean;
  context: { cwd: string; git_branch: string | null };
}

const CommandInput = ({ onCommandSubmit, selectedModel, ollamaOnline, context }: Props) => {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const ref = useRef<HTMLTextAreaElement>(null);

  const isAI = value.startsWith("/");

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const shortPath = (p: string) => {
    const parts = p.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || "~";
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const type = isAI ? "ai" : "shell";
    const cmd = isAI ? trimmed.slice(1).trim() : trimmed;
    if (cmd) {
      setHistory((prev) => [...prev, trimmed]);
      setHistoryIdx(-1);
      onCommandSubmit(cmd, type);
      setValue("");
      if (ref.current) ref.current.style.height = "auto";
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "ArrowUp" && !value) {
      e.preventDefault();
      if (history.length > 0) {
        const i = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(i);
        setValue(history[i]);
      }
    }
    if (e.key === "ArrowDown" && historyIdx !== -1) {
      e.preventDefault();
      if (historyIdx < history.length - 1) {
        setHistoryIdx(historyIdx + 1);
        setValue(history[historyIdx + 1]);
      } else {
        setHistoryIdx(-1);
        setValue("");
      }
    }
  };

  return (
    <div className="editor" onClick={() => ref.current?.focus()}>
      <div className={`editor-box ${isAI ? "editor-box-ai" : ""}`}>
        {/* 경로 + git */}
        <div className="editor-header">
          <span className="editor-path">{shortPath(context.cwd)}</span>
          {context.git_branch && (
            <>
              <span className="editor-on">on</span>
              <span className="editor-branch">{context.git_branch}</span>
            </>
          )}
          {isAI && ollamaOnline && (
            <span className="editor-ai-badge">
              <Zap size={10} />
              AI · {selectedModel}
            </span>
          )}
        </div>

        {/* 입력 */}
        <div className="editor-input-row">
          <span className="editor-prompt">$</span>
          <textarea
            ref={ref}
            className="editor-input"
            rows={1}
            value={value}
            placeholder={isAI ? "AI에게 질문하세요..." : ""}
            onChange={(e) => {
              setValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={onKeyDown}
            autoFocus
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
