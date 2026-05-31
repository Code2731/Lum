import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const MENU_WIDTH = 200;
const MENU_FALLBACK_HEIGHT_WITH_LINK = 204;
const MENU_FALLBACK_HEIGHT_WITHOUT_LINK = 172;
const MENU_EDGE_GAP = 8;
const clampValue = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));
const getFallbackViewportSize = () => ({
  width: typeof window === "undefined" ? 1200 : window.innerWidth,
  height: typeof window === "undefined" ? 800 : window.innerHeight,
});

const clampMenuPos = (x: number, y: number, width: number, height: number) => {
  const viewport = getFallbackViewportSize();
  return {
    left: clampValue(x, 0, Math.max(0, viewport.width - width - MENU_EDGE_GAP)),
    top: clampValue(y, 0, Math.max(0, viewport.height - height - MENU_EDGE_GAP)),
  };
};

const TerminalContextMenu: React.FC<Props> = ({
  x, y, text, isPathOrUrl,
  onClose, onCopy, onRun, onExplain, onWebSearch, onOpen,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const fallbackHeight = isPathOrUrl ? MENU_FALLBACK_HEIGHT_WITH_LINK : MENU_FALLBACK_HEIGHT_WITHOUT_LINK;
  const [position, setPosition] = useState(() => clampMenuPos(x, y, MENU_WIDTH, fallbackHeight));

  const menuItems = [
    { label: "복사", shortcut: "Cmd/Ctrl+C", action: onCopy },
    { label: "명령어로 실행", shortcut: null, action: onRun },
    { label: "AI로 설명", shortcut: "?", action: onExplain },
    { label: "웹에서 검색", shortcut: null, action: onWebSearch },
    ...(isPathOrUrl ? [{ label: "열기", shortcut: null, action: onOpen }] : []),
  ];

  const closeOrAction = (index: number) => {
    const item = menuItems[index];
    if (!item) return;
    item.action();
    onClose();
  };

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", handler);
    document.addEventListener("keydown", keyHandler, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", keyHandler, { capture: true });
    };
  }, [onClose]);

  useEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) previousFocusRef.current = activeElement;

    return () => {
      const target = previousFocusRef.current;
      if (target?.isConnected) {
        target.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    setIsReady(false);
  }, [x, y, isPathOrUrl]);

  useEffect(() => {
    const selected = itemRefs.current[activeIndex];
    selected?.focus();
  }, [activeIndex]);

  useEffect(() => {
    itemRefs.current = [];
    setActiveIndex(0);
  }, [isPathOrUrl]);

  useLayoutEffect(() => {
    const menuRectWidth = menuRef.current?.getBoundingClientRect().width;
    const menuRectHeight = menuRef.current?.getBoundingClientRect().height;
    const width = (menuRectWidth && Number.isFinite(menuRectWidth) && menuRectWidth > 0) ? menuRectWidth : MENU_WIDTH;
    const fallbackHeight = isPathOrUrl ? MENU_FALLBACK_HEIGHT_WITH_LINK : MENU_FALLBACK_HEIGHT_WITHOUT_LINK;
    const height = (menuRectHeight && Number.isFinite(menuRectHeight) && menuRectHeight > 0) ? menuRectHeight : fallbackHeight;

    setPosition((prev) => {
      const next = clampMenuPos(x, y, width, height);
      if (prev.left === next.left && prev.top === next.top) {
        return prev;
      }
      return next;
    });
    setIsReady(true);
  }, [x, y, isPathOrUrl]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    e.stopPropagation();

    const last = menuItems.length - 1;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev >= last ? 0 : prev + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? last : prev - 1));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(last);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      closeOrAction(activeIndex);
    }
  };

  // 화면 밖으로 나가지 않도록 위치 조정
  const preview = text.length > 40 ? text.slice(0, 40) + "…" : text;

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-50 w-[200px] bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1"
      role="menu"
      aria-label="터미널 컨텍스트 메뉴"
      tabIndex={-1}
      style={{
        left: position.left,
        top: position.top,
        visibility: isReady ? "visible" : "hidden",
        pointerEvents: isReady ? "auto" : "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      {/* 선택 텍스트 미리보기 */}
      <div className="px-3 py-1.5 mb-0.5 border-b border-white/5">
        <p className="text-xs font-mono text-white/25 truncate">{preview}</p>
      </div>

      <div className="px-1 space-y-0.5">
        {menuItems.map((entry, index) => (
          <button
            type="button"
            role="menuitem"
            key={entry.label}
            ref={(el) => { itemRefs.current[index] = el; }}
            onFocus={() => setActiveIndex(index)}
            onClick={() => closeOrAction(index)}
            aria-label={entry.label}
            tabIndex={activeIndex === index ? 0 : -1}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors rounded-md
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-[#161b22]
            `}
          >
            <span className="shrink-0 text-white/30">
              {entry.label === "복사" ? <Copy size={11} /> : null}
              {entry.label === "명령어로 실행" ? <Play size={11} /> : null}
              {entry.label === "AI로 설명" ? <Sparkles size={11} /> : null}
              {entry.label === "웹에서 검색" ? <Search size={11} /> : null}
              {entry.label === "열기" ? <ExternalLink size={11} /> : null}
            </span>
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut && <span className="text-white/20 text-xs shrink-0">{entry.shortcut}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  if (typeof document === "undefined") return menu;
  return createPortal(menu, document.body);
};

export default TerminalContextMenu;
