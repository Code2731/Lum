import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "@/components/ui/icon-button";

type TauriWindow = ReturnType<typeof getCurrentWindow>;

function resolveCurrentWindow(): TauriWindow | null {
  try {
    return getCurrentWindow();
  } catch {
    // 브라우저 미리보기/단위 테스트에서는 Tauri window bridge가 없다.
    return null;
  }
}

const win = resolveCurrentWindow();

export interface WindowControlMeta {
  ariaLabel: string;
  tooltip: string;
  description: string;
}

export function getWindowControlMeta(
  type: "close" | "minimize" | "maximize",
  isMaximized = false,
): WindowControlMeta {
  if (type === "close") {
    return {
      ariaLabel: "닫기",
      tooltip: "닫기",
      description: "현재 LUM 창을 즉시 닫습니다. 진행 중인 세션이 있으면 창 종료 흐름으로 이어집니다.",
    };
  }

  if (type === "minimize") {
    return {
      ariaLabel: "최소화",
      tooltip: "최소화",
      description: "현재 창을 독이나 작업 표시줄로 내리고, 실행 중인 작업은 백그라운드에서 유지합니다.",
    };
  }

  return isMaximized
    ? {
      ariaLabel: "복원",
      tooltip: "복원",
      description: "전체 화면처럼 넓어진 창 크기를 이전 작업 크기로 되돌립니다.",
    }
    : {
      ariaLabel: "최대화",
      tooltip: "최대화",
      description: "현재 창을 더 넓게 펼쳐 터미널과 패널을 동시에 보기 쉽게 만듭니다.",
    };
}

export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const closeMeta = getWindowControlMeta("close");
  const minimizeMeta = getWindowControlMeta("minimize");
  const maximizeMeta = getWindowControlMeta("maximize", isMaximized);

  useEffect(() => {
    if (!win) return;

    win.isMaximized().then(setIsMaximized).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isMaximized().then((v) => setIsMaximized(prev => prev === v ? prev : v)).catch(() => {});
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  if (!win) return null;

  return (
    <div className="flex items-center gap-1.5 ml-2 shrink-0 group">
      <IconButton
        aria-label={closeMeta.ariaLabel}
        tooltip={closeMeta.tooltip}
        description={closeMeta.description}
        onClick={() => win.close().catch(() => {})}
        className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors flex items-center justify-center"
      >
        <span className="hidden group-hover:block text-xs text-red-900 font-bold leading-none">✕</span>
      </IconButton>
      <IconButton
        aria-label={minimizeMeta.ariaLabel}
        tooltip={minimizeMeta.tooltip}
        description={minimizeMeta.description}
        onClick={() => win.minimize().catch(() => {})}
        className="w-3 h-3 rounded-full bg-yellow-400/80 hover:bg-yellow-400 transition-colors flex items-center justify-center"
      >
        <span className="hidden group-hover:block text-xs text-yellow-900 font-bold leading-none">−</span>
      </IconButton>
      <IconButton
        aria-label={maximizeMeta.ariaLabel}
        tooltip={maximizeMeta.tooltip}
        description={maximizeMeta.description}
        onClick={() => win.toggleMaximize().catch(() => {})}
        className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors flex items-center justify-center"
      >
        <span className="hidden group-hover:block text-xs text-green-900 font-bold leading-none">+</span>
      </IconButton>
    </div>
  );
}
