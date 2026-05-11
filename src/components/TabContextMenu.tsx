import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
const MENU_FALLBACK_WIDTH = 220;
const MENU_FALLBACK_HEIGHT = 280;
const MENU_EDGE_GAP = 10;

const clampValue = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

const TabContextMenu: React.FC<Props> = ({
  tabId, currentColor, currentGroup,
  x, y, onSetColor, onSetGroup, onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const colorButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeColorIndex, setActiveColorIndex] = useState(0);
  const [position, setPosition] = useState({
    left: clampValue(x, 0, Math.max(0, window.innerWidth - MENU_FALLBACK_WIDTH - MENU_EDGE_GAP)),
    top: clampValue(y, 0, Math.max(0, window.innerHeight - MENU_FALLBACK_HEIGHT - MENU_EDGE_GAP)),
  });

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const menuWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : MENU_FALLBACK_WIDTH;
    const menuHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : MENU_FALLBACK_HEIGHT;
    setPosition({
      left: clampValue(x, 0, Math.max(0, window.innerWidth - menuWidth - MENU_EDGE_GAP)),
      top: clampValue(y, 0, Math.max(0, window.innerHeight - menuHeight - MENU_EDGE_GAP)),
    });
  }, [x, y]);

  useEffect(() => {
    const currentColorIdx = COLOR_ENTRIES.findIndex(([name]) => name === currentColor);
    setActiveColorIndex(Math.max(0, currentColorIdx));
  }, [currentColor]);

  useEffect(() => {
    const current = colorButtonsRef.current[activeColorIndex];
    current?.focus();
  }, [activeColorIndex]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      return;
    }

    const last = COLOR_ENTRIES.length - 1;
    if (["ArrowRight", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      setActiveColorIndex(prev => (prev >= last ? 0 : prev + 1));
      return;
    }

    if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      setActiveColorIndex(prev => (prev <= 0 ? last : prev - 1));
      return;
    }

    if (e.key === "Home") {
      e.preventDefault();
      setActiveColorIndex(0);
      return;
    }

    if (e.key === "End") {
      e.preventDefault();
      setActiveColorIndex(last);
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      const [color] = COLOR_ENTRIES[activeColorIndex];
      if (color) {
        e.preventDefault();
        onSetColor(tabId, color);
        onClose();
      }
      return;
    }

    if (e.key === "g" || e.key === "G") {
      inputRef.current?.focus();
    }
  };

  const style: React.CSSProperties = {
    position: "fixed",
    left: position.left,
    top: position.top,
    zIndex: 100,
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      style={style}
      role="menu"
      className="bg-[#161b22] border border-white/10 rounded-xl shadow-2xl w-52 overflow-hidden"
      onContextMenu={e => e.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-1.5 mb-2">
          <Palette size={11} className="text-white/30" />
          <span className="text-[10px] text-white/30">탭 색상</span>
          {currentColor && (
            <button
              type="button"
              aria-label="탭 색상 초기화"
              onClick={() => { onSetColor(tabId, undefined); onClose(); }}
              className="ml-auto text-[9px] text-white/25 hover:text-white/60 transition-colors"
            >
              초기화
            </button>
          )}
        </div>
        <div role="radiogroup" aria-label="탭 색상 선택" className="flex flex-wrap gap-1.5">
          {COLOR_ENTRIES.map(([name, hex], index) => (
            <button
              type="button"
              role="radio"
              aria-label={`탭 색상 ${name}`}
              key={name}
              ref={(el) => { colorButtonsRef.current[index] = el; }}
              aria-checked={currentColor === name}
              tabIndex={activeColorIndex === index ? 0 : -1}
              onFocus={() => setActiveColorIndex(index)}
              title={name}
              onClick={() => { onSetColor(tabId, name); onClose(); }}
              className="w-5 h-5 rounded-full transition-transform hover:scale-110 ring-offset-1 ring-offset-[#161b22]"
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSetColor(tabId, name);
                  onClose();
                }
                e.stopPropagation();
              }}
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

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Tag size={11} className="text-white/30" />
          <span className="text-[10px] text-white/30">그룹 이름</span>
          {currentGroup && (
            <button
              type="button"
              aria-label="탭 그룹 초기화"
              onClick={() => { onSetGroup(tabId, undefined); onClose(); }}
              className="ml-auto text-[9px] text-white/25 hover:text-white/60 transition-colors"
            >
              <X size={9} />
            </button>
          )}
        </div>
        <input
          ref={inputRef}
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
