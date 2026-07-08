import { useState, useMemo } from "react";
import { Zap, Mic, MicOff, Copy, RotateCcw, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { shortPath } from "../utils";
import Editor from "react-simple-code-editor";
import { invoke } from "@tauri-apps/api/core";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/themes/prism-tomorrow.css";
import { useVoiceInput } from "../hooks/useVoiceInput";

interface Props {
  onCommandSubmit: (cmd: string, type: "shell" | "ai") => void;
  selectedModel: string;
  xllmOnline: boolean;
  context: { cwd: string; git_branch: string | null };
}

const VOICE_ERROR_FONT_SIZE = 11;

const CommandInput = ({
  onCommandSubmit,
  selectedModel,
  xllmOnline,
  context,
}: Props) => {
  const [value, setValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  const injectTranscript = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setValue((prev) => (prev.trim() ? `${prev} ${t}` : t));
  };

  const { isRecording, voiceBusy, voiceError, handleMicToggle, clearVoiceError } = useVoiceInput({
    onTranscript: injectTranscript,
  });
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // 자동 완성 상태
  const [completions, setCompletions] = useState<string[]>([]);
  const [compIdx, setCompIdx] = useState(0);
  const [showCompletions, setShowCompletions] = useState(false);

  const isAI = value.startsWith("/");

  // 고스트 텍스트 예측 (히스토리 기반)
  const ghostText = useMemo(() => {
    if (!value || isAI || value.trim() === "") return "";
    // 히스토리 중 현재 입력값으로 시작하는 가장 최근 명령어 찾기
    const match = history.find((cmd) => cmd.startsWith(value) && cmd !== value);
    if (match) {
      return match.slice(value.length);
    }
    return "";
  }, [value, history, isAI]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const type = isAI ? "ai" : "shell";
    const cmd = isAI ? trimmed.slice(1).trim() : trimmed;
    if (cmd) {
      // 히스토리 업데이트 (중복 제거 후 맨 앞에 추가)
      setHistory((prev) =>
        [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 100),
      );
      setHistoryIdx(-1);
      onCommandSubmit(cmd, type);
      setValue("");
      setShowCompletions(false);
    }
  };

  const onKeyDown = async (e: React.KeyboardEvent) => {
    if (isComposing || e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    // Right Arrow로 고스트 텍스트 수락
    if (e.key === "ArrowRight" && ghostText !== "") {
      e.preventDefault();
      setValue(value + ghostText);
      return;
    }

    // 자동 완성 (Tab)
    if (e.key === "Tab") {
      e.preventDefault();
      if (isAI) return;

      if (showCompletions && completions.length > 0) {
        const next = (compIdx + 1) % completions.length;
        setCompIdx(next);
        applyCompletion(completions[next]);
      } else {
        const lastWord = value.split(" ").pop() || "";
        try {
          const results = await invoke<string[]>("get_completions", {
            cwd: context.cwd,
            partial: lastWord,
          });
          if (results.length > 0) {
            setCompletions(results);
            setCompIdx(0);
            setShowCompletions(true);
            applyCompletion(results[0]);
          }
        } catch (err) {}
      }
      return;
    }

    if (e.key === "Escape") {
      setShowCompletions(false);
      return;
    }

    if (e.key === "ArrowUp" && !value) {
      e.preventDefault();
      if (history.length > 0) {
        const i =
          historyIdx === -1 ? 0 : Math.min(history.length - 1, historyIdx + 1);
        setHistoryIdx(i);
        setValue(history[i]);
      }
    }
    if (e.key === "ArrowDown" && historyIdx !== -1) {
      e.preventDefault();
      if (historyIdx > 0) {
        setHistoryIdx(historyIdx - 1);
        setValue(history[historyIdx - 1]);
      } else {
        setHistoryIdx(-1);
        setValue("");
      }
    }

    if (e.key === "Home" && !isComposing && !value && history.length > 0) {
      e.preventDefault();
      const first = 0;
      setHistoryIdx(first);
      setValue(history[first]);
      return;
    }

    if (e.key === "End" && !isComposing && !value && history.length > 0) {
      e.preventDefault();
      const last = history.length - 1;
      setHistoryIdx(last);
      setValue(history[last]);
      return;
    }

    if (
      e.key !== "Tab" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowRight"
    ) {
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
    return Prism.highlight(
      code,
      Prism.languages.bash || Prism.languages.plain,
      "bash",
    );
  };

  return (
    <div className="editor">
      {showCompletions && completions.length > 1 && (
        <div className="autocomplete-popover">
          {completions.map((c, i) => (
            <div
              key={c}
              className={`autocomplete-item ${i === compIdx ? "active" : ""}`}
            >
              {c}
            </div>
          ))}
        </div>
      )}

      <div className={`editor-box ${isAI ? "editor-box-ai" : ""} ${isRecording ? "recording" : ""}`}>
        <div className="editor-header">
          <IconButton
            tooltip={isRecording ? "음성 녹음 중지" : "음성 녹음 시작"}
            className={`mic-btn ${isRecording ? "active" : ""}`}
            onClick={handleMicToggle}
            disabled={voiceBusy}
          >
            {isRecording ? <Mic size={14} /> : <MicOff size={14} />}
          </IconButton>
          <span className="editor-path">{shortPath(context.cwd)}</span>
          {context.git_branch && (
            <>
              <span className="editor-on">on</span>
              <span className="editor-branch">{context.git_branch}</span>
            </>
          )}
          {isAI && (xllmOnline || selectedModel.startsWith("gemini-") || selectedModel.startsWith("webgpu-")) && (
            <span
              className={`editor-ai-badge ${selectedModel.startsWith("gemini-") ? "gemini" : selectedModel.startsWith("webgpu-") ? "webgpu" : ""}`}
            >
              <Zap size={10} />
              AI · {selectedModel}
              {selectedModel === "gemini-1.5-flash" && (
                <span className="free-tag">Free</span>
              )}
              {selectedModel.startsWith("webgpu-") && (
                <span className="local-tag">Local GPU</span>
              )}
            </span>
          )}
        </div>
        {voiceError && (
          <div
            role="alert"
            className="voice-error-banner"
            style={{
              margin: "0 10px 6px 10px",
              padding: "4px 8px",
              borderRadius: 6,
              fontSize: VOICE_ERROR_FONT_SIZE,
              lineHeight: 1.3,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "#ff7b72",
              background: "rgba(248,81,73,0.12)",
              border: "1px solid rgba(248,81,73,0.25)",
              whiteSpace: "normal",
              textOverflow: "initial",
                overflow: "hidden",
            }}
            title={voiceError}
          >
            <span className="voice-error-text">음성 입력 오류: {voiceError}</span>
            <IconButton
              tooltip="오류 텍스트 복사"
              onClick={() => {
                if (!voiceError) return;
                navigator.clipboard?.writeText?.(`음성 입력 오류: ${voiceError}`).catch(() => {});
              }}
              className="p-1 rounded text-red-300 hover:text-red-100 hover:bg-red-500/20 transition-colors shrink-0"
            >
              <Copy size={11} />
            </IconButton>
            <IconButton
              tooltip="음성 입력 다시 시도"
              onClick={handleMicToggle}
              disabled={voiceBusy}
              className="p-1 rounded text-red-300 hover:text-red-100 hover:bg-red-500/20 transition-colors shrink-0"
            >
              <RotateCcw size={11} />
            </IconButton>
            <IconButton
              tooltip="음성 입력 오류 닫기"
              onClick={clearVoiceError}
              className="p-1 rounded text-red-300 hover:text-red-100 hover:bg-red-500/20 transition-colors shrink-0"
            >
              <X size={11} />
            </IconButton>
          </div>
        )}

        <div className="editor-input-row">
          <span className="editor-prompt">
            {isAI ? <Zap size={14} style={{ color: "#a78bfa" }} /> : "$"}
          </span>
          <div
            className="editor-input-wrapper"
            style={{ width: "100%", position: "relative" }}
          >
            <Editor
              value={value}
              onValueChange={(code) => {
                if (voiceError) {
                  clearVoiceError();
                }
                setValue(code);
              }}
              highlight={highlight}
              padding={0}
              onKeyDown={onKeyDown}
              className="editor-input"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--font-size)",
                lineHeight: "var(--line-height)",
                width: "100%",
                outline: "none",
                background: "transparent",
                zIndex: 2,
                position: "relative",
              }}
              textareaId="command-editor-textarea"
              placeholder={isAI ? "AI에게 질문하세요..." : ""}
              autoFocus
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
            />
            {/* 고스트 텍스트 레이어 */}
            {!isAI && ghostText && value && (
              <div
                className="ghost-text-layer"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--font-size)",
                  lineHeight: "var(--line-height)",
                  pointerEvents: "none",
                  whiteSpace: "pre",
                  zIndex: 1,
                  color: "transparent",
                }}
              >
                {value}
                <span style={{ color: "rgba(255, 255, 255, 0.3)" }}>
                  {ghostText}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
