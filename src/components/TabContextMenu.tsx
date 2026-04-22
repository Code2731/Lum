import React, { useEffect, useRef } from "react";
import { Palette, Tag, X } from "lucide-react";
import { TAB_COLORS } from "../hooks/useTabManager";
import type { TabColor } from "../hooks/useTabManager";

interface Props {
  tabId: string;
  currentColor?: TabColor;
  currentGroup?: string;
  x: number;
  y: number;
  onSetColor: (id: string, color: TabColor | undefined) => void;
  onSetGroup: (id: string, group: string | undefined) => void;
  onClose: () => void;
}

const COLOR_ENTRIES = Object.entries(TAB_COLORS) as [TabColor, string][];

const TabContextMenu: React.FC<Props> = ({
  tabId, currentColor, currentGroup,
  x, y, onSetColor, onSetGroup, onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  // 화면 끝에 걸리지 않도록 위치 조정
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 280),
    zIndex: 100,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="bg-[#161b22] border border-white/10 rounded-xl shadow-2xl w-52 overflow-hidden"
      onContextMenu={e => e.preventDefault()}
    >
      {/* 색상 선택 */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-1.5 mb-2">
          <Palette size={11} className="text-white/30" />
          <span className="text-[10px] text-white/30">탭 색상</span>
          {currentColor && (
            <button
              onClick={() => { onSetColor(tabId, undefined); onClose(); }}
              className="ml-auto text-[9px] text-white/25 hover:text-white/60 transition-colors"
            >
              초기화
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_ENTRIES.map(([name, hex]) => (
            <button
              key={name}
              title={name}
              onClick={() => { onSetColor(tabId, name); onClose(); }}
              className="w-5 h-5 rounded-full transition-transform hover:scale-110 ring-offset-1 ring-offset-[#161b22]"
              style={{
                backgroundColor: hex,
                boxShadow: currentColor === name ? `0 0 0 2px #fff4` : undefined,
                outline: currentColor === name ? `2px solid ${hex}` : undefined,
              }}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-white/6 mx-3" />

      {/* 그룹 레이블 */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Tag size={11} className="text-white/30" />
          <span className="text-[10px] text-white/30">그룹 이름</span>
          {currentGroup && (
            <button
              onClick={() => { onSetGroup(tabId, undefined); onClose(); }}
              className="ml-auto text-[9px] text-white/25 hover:text-white/60 transition-colors"
            >
              <X size={9} />
            </button>
          )}
        </div>
        <input
          ref={groupInputRef}
          defaultValue={currentGroup ?? ""}
          placeholder="예: backend, deploy…"
          className="w-full bg-white/5 border border-white/8 rounded-lg px-2 py-1 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-accent/40"
          onKeyDown={e => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value.trim();
              onSetGroup(tabId, val || undefined);
              onClose();
            }
            if (e.key === "Escape") onClose();
            e.stopPropagation();
          }}
          onClick={e => e.stopPropagation()}
        />
        <p className="text-[9px] text-white/20 mt-1">Enter로 적용</p>
      </div>
    </div>
  );
};

export default TabContextMenu;
