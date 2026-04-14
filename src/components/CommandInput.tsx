import { useState, useRef, useEffect } from "react";
import { Zap } from "lucide-react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/themes/prism-tomorrow.css"; // 다크 테마 기반

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
  const editorRef = useRef<any>(null);

  const isAI = value.startsWith("/");

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
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
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

  const highlight = (code: string) => {
    if (code.startsWith("/")) {
      return `<span style="color: #a78bfa">${code}</span>`; // AI 모드 강조 (보라색 계열)
    }
    return Prism.highlight(code, Prism.languages.bash || Prism.languages.plain, "bash");
  };

  return (
    <div className="editor">
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
          <span className="editor-prompt">{isAI ? <Zap size={14} style={{ color: "#a78bfa" }} /> : "$"}</span>
          <div className="editor-input-wrapper" style={{ width: '100%' }}>
            <Editor
              value={value}
              onValueChange={(code) => setValue(code)}
              highlight={highlight}
              padding={0}
              onKeyDown={onKeyDown}
              className="editor-input"
              style={{
                fontFamily: '"Fira Code", "Fira Mono", monospace',
                fontSize: 14,
                width: '100%',
                outline: 'none',
              }}
              textareaId="command-editor-textarea"
              placeholder={isAI ? "AI에게 질문하세요..." : ""}
              autoFocus
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
