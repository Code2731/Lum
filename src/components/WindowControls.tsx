import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();

export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    win.isMaximized().then(setIsMaximized).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isMaximized().then((v) => setIsMaximized(prev => prev === v ? prev : v)).catch(() => {});
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div className="flex items-center gap-1.5 ml-2 shrink-0 group">
      <button
        aria-label="닫기"
        title="닫기"
        onClick={() => win.close().catch(() => {})}
        className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors flex items-center justify-center"
      >
        <span className="hidden group-hover:block text-[7px] text-red-900 font-bold leading-none">✕</span>
      </button>
      <button
        aria-label="최소화"
        title="최소화"
        onClick={() => win.minimize().catch(() => {})}
        className="w-3 h-3 rounded-full bg-yellow-400/80 hover:bg-yellow-400 transition-colors flex items-center justify-center"
      >
        <span className="hidden group-hover:block text-[7px] text-yellow-900 font-bold leading-none">−</span>
      </button>
      <button
        aria-label={isMaximized ? "복원" : "최대화"}
        title={isMaximized ? "복원" : "최대화"}
        onClick={() => win.toggleMaximize().catch(() => {})}
        className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors flex items-center justify-center"
      >
        <span className="hidden group-hover:block text-[7px] text-green-900 font-bold leading-none">+</span>
      </button>
    </div>
  );
}
