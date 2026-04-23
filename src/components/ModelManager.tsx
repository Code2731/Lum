import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, Trash2, X, HardDrive, Cpu } from "lucide-react";

interface LocalModel {
  id: string;
  size_mb: number;
  path: string;
}

interface DownloadProgress {
  repo_id: string;
  file: string;
  downloaded: number;
  total: number;
  done: boolean;
}

interface CuratedModel {
  repo_id: string;
  revision: string;
  label: string;
  description: string;
  size_gb: number;
  min_ram_gb: number;
}

const CURATED_MODELS: CuratedModel[] = [
  {
    repo_id: "turboderp/Qwen2.5-Coder-3B-Instruct-exl2",
    revision: "4.0bpw",
    label: "Qwen2.5-Coder 3B (4bpw)",
    description: "최소 사양 — 8GB RAM, CPU 추론 가능",
    size_gb: 2.5,
    min_ram_gb: 8,
  },
  {
    repo_id: "turboderp/Phi-3.5-mini-instruct-exl2",
    revision: "4.0bpw",
    label: "Phi-3.5-mini 3.8B (4bpw)",
    description: "효율형 — 16GB RAM iGPU/CPU 권장",
    size_gb: 2.8,
    min_ram_gb: 16,
  },
  {
    repo_id: "turboderp/Qwen2.5-Coder-7B-Instruct-exl2",
    revision: "4.0bpw",
    label: "Qwen2.5-Coder 7B (4bpw)",
    description: "균형형 — 32GB RAM iGPU 또는 CPU",
    size_gb: 4.5,
    min_ram_gb: 32,
  },
  {
    repo_id: "turboderp/Qwen2.5-Coder-7B-Instruct-exl2",
    revision: "5.0bpw",
    label: "Qwen2.5-Coder 7B (5bpw)",
    description: "속도·품질 균형 — Discrete GPU 권장",
    size_gb: 5.5,
    min_ram_gb: 16,
  },
  {
    repo_id: "turboderp/Qwen2.5-Coder-14B-Instruct-exl2",
    revision: "5.0bpw",
    label: "Qwen2.5-Coder 14B (5bpw)",
    description: "고품질 — Discrete GPU + 32GB RAM",
    size_gb: 10.5,
    min_ram_gb: 32,
  },
];

interface Props {
  onClose: () => void;
  recommendedModel?: string;
}

const ModelManager: React.FC<Props> = ({ onClose, recommendedModel }) => {
  const [tab, setTab] = useState<"installed" | "download">("installed");
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [downloading, setDownloading] = useState<Record<string, DownloadProgress>>({});
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [hfToken, setHfToken] = useState("");

  const loadLocalModels = useCallback(async () => {
    try {
      const models = await invoke<LocalModel[]>("list_local_models");
      setLocalModels(models);
    } catch {
      // 모델 디렉토리 없을 경우 빈 목록
    }
  }, []);

  useEffect(() => {
    loadLocalModels();

    const unlisten = listen<DownloadProgress>("model_download_progress", (event) => {
      const p = event.payload;
      setStarting(prev => { const s = new Set(prev); s.delete(p.repo_id); return s; });
      if (p.done) {
        setDownloading((prev) => {
          const next = { ...prev };
          delete next[p.repo_id];
          return next;
        });
        loadLocalModels();
      } else {
        setDownloading((prev) => ({ ...prev, [p.repo_id]: p }));
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadLocalModels]);

  const handleDownload = async (model: CuratedModel) => {
    if (downloading[model.repo_id] || starting.has(model.repo_id)) return;
    setDownloadError(null);
    setStarting(prev => new Set(prev).add(model.repo_id));
    try {
      await invoke("download_model", {
        repoId: model.repo_id,
        revision: model.revision,
        hfToken: hfToken || null,
      });
    } catch (err) {
      // Tauri v2 에러는 { type, message } 객체로 직렬화됨
      const raw = err as { message?: string } | string | null;
      const msg = typeof raw === "string"
        ? raw
        : (raw?.message ?? JSON.stringify(raw) ?? "알 수 없는 오류");
      setDownloadError(msg);
      setTab("download"); // 에러가 있는 탭으로 자동 이동
    } finally {
      setStarting(prev => { const s = new Set(prev); s.delete(model.repo_id); return s; });
    }
  };

  const handleDelete = async (modelId: string) => {
    if (!confirm(`"${modelId}" 모델을 삭제할까요?`)) return;
    setDeleting(modelId);
    try {
      await invoke("delete_model", { modelId });
      await loadLocalModels();
    } catch (err) {
      console.error("삭제 실패:", err);
    } finally {
      setDeleting(null);
    }
  };

  const formatMb = (mb: number) =>
    mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;

  const progressPct = (p: DownloadProgress) =>
    p.total > 0 ? Math.round((p.downloaded / p.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0f1117] border border-white/10 rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-accent" />
            <span className="text-sm font-semibold">모델 관리</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-white/5">
          {(["installed", "download"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t ? "text-white border-b border-accent" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "installed" ? `설치된 모델 (${localModels.length})` : "다운로드"}
            </button>
          ))}
        </div>

        {/* 다운로드 에러 — 탭에 관계없이 항상 표시 */}
        {downloadError && (
          <div className="flex items-start gap-2 px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span className="flex-1 break-all">{downloadError}</span>
            <button onClick={() => setDownloadError(null)} className="shrink-0 text-red-400/60 hover:text-red-400">✕</button>
          </div>
        )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tab === "installed" ? (
            localModels.length === 0 ? (
              <div className="text-center text-white/30 py-12 text-sm">
                설치된 모델이 없습니다.
              </div>
            ) : (
              localModels.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5"
                >
                  <div>
                    <div className="text-xs font-medium">{m.id}</div>
                    <div className="text-[10px] text-white/40 mt-0.5">{formatMb(m.size_mb)}</div>
                  </div>
                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={deleting === m.id}
                    className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )
          ) : (
            <>
              {/* HF 토큰 입력 */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="password"
                  placeholder="HuggingFace 토큰 (비공개 모델용, 선택)"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs outline-none focus:border-accent/50"
                />
              </div>


              {CURATED_MODELS.map((m) => {
                const prog = downloading[m.repo_id];
                const isStarting = starting.has(m.repo_id);
                const isRecommended = recommendedModel
                  ?.toLowerCase()
                  .includes(m.label.split(" ")[1].toLowerCase());

                return (
                  <div
                    key={`${m.repo_id}@${m.revision}`}
                    className={`p-3 bg-white/5 rounded-lg border transition-colors ${
                      isRecommended ? "border-accent/30" : "border-white/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{m.label}</span>
                          {isRecommended && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-accent/20 text-accent rounded-full whitespace-nowrap">
                              추천
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-white/40 mt-0.5">{m.description}</div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30">
                          <span className="flex items-center gap-1">
                            <HardDrive size={9} /> ~{m.size_gb} GB
                          </span>
                          <span className="flex items-center gap-1">
                            <Cpu size={9} /> RAM {m.min_ram_gb}GB+
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(m)}
                        disabled={!!prog || isStarting}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-accent/20 text-xs transition-colors disabled:opacity-50"
                      >
                        <Download size={11} />
                        {isStarting ? "연결 중…" : prog ? `${progressPct(prog)}%` : "받기"}
                      </button>
                    </div>

                    {/* 진행 바 */}
                    {prog && (
                      <div className="mt-2">
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all duration-300"
                            style={{ width: `${progressPct(prog)}%` }}
                          />
                        </div>
                        <div className="text-[9px] text-white/30 mt-0.5 truncate">{prog.file}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelManager;
