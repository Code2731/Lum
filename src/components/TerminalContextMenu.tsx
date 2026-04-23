import React, { useEffect, useRef } from "react";
import { Copy, Play, Search, ExternalLink, Sparkles } from "lucide-react";

interface Props {
  x: number;
  y: number;
  text: string;
  isPathOrUrl: boolean;
  onClose: () => void;
  onCopy: () => void;
  onRun: () => void;
  onExplain: () => void;
  onWebSearch: () => void;
  onOpen: () => void;
}

const TerminalContextMenu: React.FC<Props> = ({
  x, y, text, isPathOrUrl,
  onClose, onCopy, onRun, onExplain, onWebSearch, onOpen,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  // 화면 밖으로 나가지 않도록 위치 조정
  const menuW = 200;
  const menuH = isPathOrUrl ? 200 : 168;
  const adjustedX = Math.min(x, window.innerWidth - menuW - 8);
  const adjustedY = Math.min(y, window.innerHeight - menuH - 8);

  const preview = text.length > 40 ? text.slice(0, 40) + "…" : text;

  const item = (
    icon: React.ReactNode,
    label: string,
    shortcut: string | null,
    action: () => void,
    danger = false,
  ) => (
    <button
      onClick={() => { action(); onClose(); }}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-left transition-colors rounded-md
        ${danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-white/65 hover:bg-white/6 hover:text-white/90"
        }`}
    >
      <span className="shrink-0 text-white/30">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-white/20 text-[9px] shrink-0">{shortcut}</span>}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-[200px] bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1"
      style={{ left: adjustedX, top: adjustedY }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 선택 텍스트 미리보기 */}
      <div className="px-3 py-1.5 mb-0.5 border-b border-white/5">
        <p className="text-[9px] font-mono text-white/25 truncate">{preview}</p>
      </div>

      <div className="px-1 space-y-0.5">
        {item(<Copy size={11} />, "복사", "⌘C", onCopy)}
        {item(<Play size={11} />, "명령어로 실행", null, onRun)}
        {item(<Sparkles size={11} />, "AI로 설명", "?", onExplain)}
        {item(<Search size={11} />, "웹에서 검색", null, onWebSearch)}
        {isPathOrUrl && item(<ExternalLink size={11} />, "열기", null, onOpen)}
      </div>
    </div>
  );
};

export default TerminalContextMenu;
