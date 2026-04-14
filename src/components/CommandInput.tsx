import { useState, useRef, useEffect } from "react";
import { Zap } from "lucide-react";
import Editor from "react-simple-code-editor";
import { invoke } from "@tauri-apps/api/core";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/themes/prism-tomorrow.css";

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
  
  // 자동 완성 상태
  const [completions, setCompletions] = useState<string[]>([]);
  const [compIdx, setCompIdx] = useState(0);
  const [showCompletions, setShowCompletions] = useState(false);

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
      setShowCompletions(false);
    }
  };

  const onKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    
    // 자동 완성 (Tab)
    if (e.key === "Tab") {
      e.preventDefault();
      if (isAI) return;

      if (showCompletions && completions.length > 0) {
        // 이미 추천 목록이 떠 있으면 다음 항목 선택
        const next = (compIdx + 1) % completions.length;
        setCompIdx(next);
        applyCompletion(completions[next]);
      } else {
        // 새로운 추천 요청
        const lastWord = value.split(" ").pop() || "";
        try {
          const results = await invoke<string[]>("get_completions", {
            cwd: context.cwd,
            partial: lastWord
          });
          if (results.length > 0) {
            setCompletions(results);
            setCompIdx(0);
            setShowCompletions(true);
            applyCompletion(results[0]);
          }
        } catch (err) {
          console.error("completion error:", err);
        }
      }
      return;
    }

    // 이스케이프 (자동 완성 닫기)
    if (e.key === "Escape") {
      setShowCompletions(false);
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
    
    // 일반 입력 시 자동 완성 닫기
    if (e.key !== "Tab" && e.key !== "ArrowUp" && e.key !== "ArrowDown") {
      setShowCompletions(false);
    }
  };

  const applyCompletion = (completion: string) => {
    const words = value.split(" ");
    words.pop();
    words.push(completion);
    setValue(words.join(" "));
  };

  const highlight = (code: string) => {
    if (code.startsWith("/")) {
      return `<span style="color: #a78bfa">${code}</span>`;
    }
    return Prism.highlight(code, Prism.languages.bash || Prism.languages.plain, "bash");
  };

  return (
    <div className="editor">
      {/* 자동 완성 추천 목록 */}
      {showCompletions && completions.length > 1 && (
        <div className="autocomplete-popover">
          {completions.map((c, i) => (
            <div key={c} className={`autocomplete-item ${i === compIdx ? "active" : ""}`}>
              {c}
            </div>
          ))}
        </div>
      )}

      <div className={`editor-box ${isAI ? "editor-box-ai" : ""}`}>
        {/* 경로 + git */}
        <div className="editor-header">
...          <span className="editor-path">{shortPath(context.cwd)}</span>
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
