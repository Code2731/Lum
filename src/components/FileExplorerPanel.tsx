import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, Folder, FolderOpen, File, ArrowUp, RefreshCw, Home, X, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

interface Props {
  cwd: string;
  onClose: () => void;
  onCdTo: (path: string) => void;  // 터미널에 `cd <path>` 주입
  onOpenFile: (path: string) => void;  // 터미널에 파일 open 주입
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as Record<string, unknown>).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
  }
  return "읽기 실패";
}

function copyText(text: string) {
  navigator.clipboard?.writeText?.(text).catch(() => {});
}

export default function FileExplorerPanel({ cwd, onClose, onCdTo, onOpenFile }: Props) {
  const [currentPath, setCurrentPath] = useState(cwd || "~");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<DirEntry[]>("list_directory", { path });
      setEntries(res);
      setCurrentPath(path);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(cwd || "~");
  }, [cwd, load]);

  const goUp = useCallback(async () => {
    try {
      const parent = await invoke<string | null>("parent_directory", { path: currentPath });
      if (parent) load(parent);
    } catch {}
  }, [currentPath, load]);

  const handleEntryClick = (e: DirEntry, doubleClick: boolean) => {
    if (e.is_dir) {
      load(e.path);
      if (doubleClick) onCdTo(e.path);
    } else if (doubleClick) {
      onOpenFile(e.path);
    }
  };

  // 경로 segment 브레드크럼
  const segments = currentPath.replace(/\\/g, "/").split("/").filter(Boolean);

  return (
    <div className="lum-explorer flex flex-col h-full border-r border-white/10">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-1.5 text-sm text-white/78 font-semibold tracking-wide">
          <Folder size={12} className="text-accent" />
          파일 탐색기
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded border border-white/[0.1] hover:bg-white/[0.08] text-white/45 hover:text-white/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/8 bg-white/[0.02]">
        <IconButton tooltip="상위 폴더" onClick={goUp}
          className="p-1 rounded border border-white/[0.1] hover:bg-white/[0.09] text-white/50 hover:text-white/82">
          <ArrowUp size={12} />
        </IconButton>
        <IconButton tooltip="홈" onClick={() => load("~")}
          className="p-1 rounded border border-white/[0.1] hover:bg-white/[0.09] text-white/50 hover:text-white/82">
          <Home size={12} />
        </IconButton>
        <IconButton tooltip="새로고침" onClick={() => load(currentPath)}
          className="p-1 rounded border border-white/[0.1] hover:bg-white/[0.09] text-white/50 hover:text-white/82">
          <RefreshCw size={11} />
        </IconButton>
        <IconButton tooltip="터미널을 이 폴더로 이동" onClick={() => onCdTo(currentPath)}
          className="ml-auto px-2 py-0.5 rounded-md border border-accent/35 bg-accent/14 hover:bg-accent/24 text-accent text-xs">
          여기로 cd
        </IconButton>
      </div>

      <div className="px-3 py-1.5 text-xs text-white/45 font-mono truncate border-b border-white/8 bg-black/10" title={currentPath}>
        {segments.length === 0 ? "/" : segments.map((s, i) => (
          <span key={i}>
            <span>{s}</span>
            {i < segments.length - 1 && <ChevronRight size={8} className="inline mx-0.5 text-white/20" />}
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="text-xs text-white/34 px-3 py-2">읽는 중…</div>}
        {error && (
          <div className="text-xs text-red-300 px-3 py-2 bg-red-500/10 border border-red-500/25 m-2 rounded-md flex items-center justify-between gap-1.5">
            <span className="truncate">{error}</span>
            <IconButton
              tooltip="오류 텍스트 복사"
              onClick={() => copyText(error)}
              className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            >
              <Copy size={11} />
            </IconButton>
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="text-xs text-white/25 px-3 py-2">빈 폴더</div>
        )}
        {entries.map((e) => (
          <div
            key={e.path}
            onClick={() => handleEntryClick(e, false)}
            onDoubleClick={() => handleEntryClick(e, true)}
            title={e.is_dir ? "더블클릭: 이 폴더로 cd / 클릭: 열기" : "더블클릭: 파일 열기"}
            className="lum-explorer-row flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-white/[0.06] cursor-pointer text-white/72 border-b border-transparent hover:border-white/[0.06]"
          >
            {e.is_dir ? (
              <FolderOpen size={12} className="text-yellow-300/75 shrink-0" />
            ) : (
              <File size={12} className="text-white/40 shrink-0" />
            )}
            <span className="flex-1 truncate">{e.name}</span>
            {!e.is_dir && <span className="text-xs text-white/30 shrink-0">{formatSize(e.size)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
