import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Trash2, X, HardDrive, Cpu, ExternalLink } from "lucide-react";

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

type ModelCategory = "coding" | "general" | "reasoning" | "lightweight";

interface CuratedModel {
  repo_id: string;
  revision: string;
  label: string;
  description: string;
  size_gb: number;
  min_ram_gb: number;
  category: ModelCategory;
  badge?: string;
}

const CATEGORY_META: Record<ModelCategory, { icon: string; label: string }> = {
  coding:     { icon: "💻", label: "코딩" },
  general:    { icon: "🌐", label: "범용" },
  reasoning:  { icon: "🧠", label: "추론" },
  lightweight:{ icon: "⚡", label: "경량" },
};

// ── Apple Silicon (MLX) ───────────────────────────────────────────
// mlx-community HuggingFace 레포에서 자동 다운로드.
// 직접 입력란에 mlx-community/model-name 형식으로 다른 모델도 사용 가능.
const MLX_MODELS: CuratedModel[] = [
  // 코딩 특화
  { category: "coding", repo_id: "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",  revision: "main", label: "Qwen2.5-Coder 7B",  description: "코딩 기본 — 4.5GB, 빠른 응답",        size_gb: 4.5, min_ram_gb: 8  },
  { category: "coding", repo_id: "mlx-community/Qwen2.5-Coder-14B-Instruct-4bit", revision: "main", label: "Qwen2.5-Coder 14B", description: "코딩 균형형 — 8.5GB",                 size_gb: 8.5, min_ram_gb: 16 },
  { category: "coding", repo_id: "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit", revision: "main", label: "Qwen2.5-Coder 32B", description: "코딩 최강 — 19GB, 36GB Mac 추천",     size_gb: 19,  min_ram_gb: 24, badge: "★ 추천" },

  // 범용 — Qwen2.5
  { category: "general", repo_id: "mlx-community/Qwen2.5-7B-Instruct-4bit",        revision: "main", label: "Qwen2.5 7B",         description: "코딩+범용 — 4.5GB",                 size_gb: 4.5, min_ram_gb: 8  },
  { category: "general", repo_id: "mlx-community/Qwen2.5-14B-Instruct-4bit",       revision: "main", label: "Qwen2.5 14B",        description: "코딩+범용 고품질 — 8.5GB",           size_gb: 8.5, min_ram_gb: 16 },
  { category: "general", repo_id: "mlx-community/Qwen2.5-32B-Instruct-4bit",       revision: "main", label: "Qwen2.5 32B",        description: "코딩+범용 최강 — 19GB",              size_gb: 19,  min_ram_gb: 24 },
  { category: "general", repo_id: "mlx-community/Qwen2.5-72B-Instruct-4bit",       revision: "main", label: "Qwen2.5 72B",        description: "최고 품질 — 38GB, Ultra 전용",       size_gb: 38,  min_ram_gb: 48 },

  // 범용 — Llama
  { category: "general", repo_id: "mlx-community/Llama-3.2-3B-Instruct-4bit",      revision: "main", label: "Llama 3.2 3B",       description: "초경량, 즉각 응답 — 2GB",            size_gb: 2,   min_ram_gb: 4  },
  { category: "general", repo_id: "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit", revision: "main", label: "Llama 3.1 8B",       description: "범용 균형 — 5GB",                    size_gb: 5,   min_ram_gb: 8  },
  { category: "general", repo_id: "mlx-community/Llama-3.3-70B-Instruct-4bit",     revision: "main", label: "Llama 3.3 70B",      description: "범용 최강 — 38GB, Ultra 전용",       size_gb: 38,  min_ram_gb: 48 },

  // 범용 — Gemma 3 (Google)
  { category: "general", repo_id: "mlx-community/gemma-3-4b-it-4bit",              revision: "main", label: "Gemma 3 4B",         description: "Google — 2.5GB, 빠른 응답",          size_gb: 2.5, min_ram_gb: 6  },
  { category: "general", repo_id: "mlx-community/gemma-3-12b-it-4bit",             revision: "main", label: "Gemma 3 12B",        description: "Google — 7GB, 고품질",               size_gb: 7,   min_ram_gb: 12 },
  { category: "general", repo_id: "mlx-community/gemma-3-27b-it-4bit",             revision: "main", label: "Gemma 3 27B",        description: "Google — 15GB, 최고품질",            size_gb: 15,  min_ram_gb: 20 },

  // 범용 — Mistral
  { category: "general", repo_id: "mlx-community/Mistral-7B-Instruct-v0.3-4bit",   revision: "main", label: "Mistral 7B",         description: "유럽 오픈소스 — 4.5GB",              size_gb: 4.5, min_ram_gb: 8  },

  // 추론 특화 — DeepSeek R1
  { category: "reasoning", repo_id: "mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit",  revision: "main", label: "DeepSeek R1 7B",  description: "추론·수학·코딩 — 4.5GB",             size_gb: 4.5, min_ram_gb: 8  },
  { category: "reasoning", repo_id: "mlx-community/DeepSeek-R1-Distill-Qwen-14B-4bit", revision: "main", label: "DeepSeek R1 14B", description: "추론 고품질 — 8.5GB",                size_gb: 8.5, min_ram_gb: 16 },
  { category: "reasoning", repo_id: "mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit", revision: "main", label: "DeepSeek R1 32B", description: "추론 최강 — 19GB",                   size_gb: 19,  min_ram_gb: 24 },

  // 경량 특화
  { category: "lightweight", repo_id: "mlx-community/phi-4-4bit",                  revision: "main", label: "Phi-4 14B",          description: "Microsoft — 8GB, 매우 효율적",       size_gb: 8,   min_ram_gb: 12 },
  { category: "lightweight", repo_id: "mlx-community/Llama-3.2-1B-Instruct-4bit",  revision: "main", label: "Llama 3.2 1B",       description: "최소 사양 — 0.7GB, 즉각 응답",       size_gb: 0.7, min_ram_gb: 2  },
];

// ── NVIDIA (EXL2 / TabbyAPI) ──────────────────────────────────────
const CURATED_MODELS: CuratedModel[] = [
  { category: "coding",   repo_id: "turboderp/Qwen2.5-Coder-3B-Instruct-exl2",  revision: "4.0bpw", label: "Qwen2.5-Coder 3B (4bpw)",  description: "최소 사양 — 8GB VRAM",   size_gb: 2.5,  min_ram_gb: 8  },
  { category: "coding",   repo_id: "turboderp/Qwen2.5-Coder-7B-Instruct-exl2",  revision: "5.0bpw", label: "Qwen2.5-Coder 7B (5bpw)",  description: "균형형 — 16GB VRAM",     size_gb: 5.5,  min_ram_gb: 16 },
  { category: "coding",   repo_id: "turboderp/Qwen2.5-Coder-14B-Instruct-exl2", revision: "5.0bpw", label: "Qwen2.5-Coder 14B (5bpw)", description: "고품질 — 24GB VRAM",     size_gb: 10.5, min_ram_gb: 24 },
  { category: "coding",   repo_id: "turboderp/Qwen2.5-Coder-32B-Instruct-exl2", revision: "4.0bpw", label: "Qwen2.5-Coder 32B (4bpw)", description: "최고 품질 — 48GB VRAM",  size_gb: 18,   min_ram_gb: 48, badge: "★ 추천" },
  { category: "general",  repo_id: "turboderp/Llama-3.1-8B-Instruct-exl2",       revision: "5.0bpw", label: "Llama 3.1 8B (5bpw)",      description: "범용 — 16GB VRAM",       size_gb: 6,    min_ram_gb: 16 },
  { category: "reasoning",repo_id: "turboderp/DeepSeek-R1-Distill-Qwen-7B-exl2", revision: "5.0bpw", label: "DeepSeek R1 7B (5bpw)",    description: "추론 특화 — 16GB VRAM",  size_gb: 5.5,  min_ram_gb: 16 },
];

interface Props {
  onClose: () => void;
  recommendedModel?: string;
}

const ModelManager: React.FC<Props> = ({ onClose, recommendedModel: _recommendedModel }) => {
  const [tab, setTab] = useState<"installed" | "download">("installed");
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [downloading, setDownloading] = useState<Record<string, DownloadProgress>>({});
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [hfToken, setHfToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenHighlight, setTokenHighlight] = useState(false);
  const tokenRef = useRef<HTMLInputElement>(null);
  const [customRepo, setCustomRepo] = useState("");
  const [customRevision, setCustomRevision] = useState("");
  const [isAppleSilicon, setIsAppleSilicon] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">("all");

  const loadLocalModels = useCallback(async () => {
    try {
      const models = await invoke<LocalModel[]>("list_local_models");
      setLocalModels(models);
    } catch {
      // 모델 디렉토리 없을 경우 빈 목록
    }
  }, []);

  const saveToken = useCallback(async (t: string) => {
    try {
      await invoke("save_hf_token", { token: t });
    } catch {
      // 저장 실패 시 무시
    }
  }, []);

  useEffect(() => {
    invoke<string>("get_platform_arch").then((a) => setIsAppleSilicon(a === "aarch64")).catch(() => {});
    // 저장된 HF 토큰 불러오기
    invoke<{ hf_token?: string }>("load_app_config")
      .then((c) => { if (c.hf_token) setHfToken(c.hf_token); })
      .catch(() => {});
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

  const startDownload = async (repoId: string, revision: string | null) => {
    if (downloading[repoId] || starting.has(repoId)) return;
    setDownloadError(null);
    setStarting(prev => new Set(prev).add(repoId));
    try {
      await invoke("download_model", { repoId, revision, hfToken: hfToken || null });
    } catch (err) {
      const raw = err as { message?: string } | string | null;
      const msg = typeof raw === "string" ? raw : (raw?.message ?? JSON.stringify(raw) ?? "알 수 없는 오류");
      setDownloadError(msg);
      setTab("download");
      if (msg.includes("인증") || msg.includes("401") || msg.includes("403")) {
        setShowToken(true);
        setTokenHighlight(true);
        setTimeout(() => {
          tokenRef.current?.focus();
          setTokenHighlight(false);
        }, 300);
      }
    } finally {
      setStarting(prev => { const s = new Set(prev); s.delete(repoId); return s; });
    }
  };

  const handleDownload = (model: CuratedModel) => startDownload(model.repo_id, model.revision);

  const handleCustomDownload = () => {
    const repo = customRepo.trim();
    if (!repo) return;
    startDownload(repo, customRevision.trim() || null);
  };

  const handleDelete = async (modelId: string) => {
    setDeleting(modelId);
    try {
      await invoke("delete_model", { modelId });
      await loadLocalModels();
    } catch (err) {
      console.error("삭제 실패:", err);
    } finally {
      setDeleting(null);
      setDeleteConfirm(null);
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
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="text-xs font-medium truncate">{m.id}</div>
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {m.size_mb === 0 ? "빈 폴더 (다운로드 미완료)" : formatMb(m.size_mb)}
                    </div>
                  </div>
                  {deleteConfirm === m.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-red-400">삭제?</span>
                      <button
                        onClick={() => handleDelete(m.id)}
                        disabled={deleting === m.id}
                        className="px-2 py-1 rounded bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-medium disabled:opacity-50 transition-colors"
                      >
                        {deleting === m.id ? "삭제 중..." : "확인"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/60 text-[10px] transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(m.id)}
                      disabled={deleting === m.id}
                      className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))
            )
          ) : (
            <>
              {/* HF 토큰 — 게이티드/비공개 모델용, 기본 숨김 */}
              <div className="mb-3">
                <button
                  onClick={() => setShowToken((v) => !v)}
                  className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  {showToken ? "▾" : "▸"} 게이티드/비공개 모델 (HuggingFace 토큰 필요)
                </button>
                {showToken && (
                  <input
                    ref={tokenRef}
                    type="password"
                    placeholder="hf_xxxxxxxx…"
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    onBlur={(e) => saveToken(e.target.value)}
                    className={`mt-1.5 w-full bg-white/5 border rounded px-3 py-1.5 text-xs outline-none transition-colors ${
                      tokenHighlight
                        ? "border-yellow-400/60 ring-1 ring-yellow-400/30"
                        : "border-white/10 focus:border-accent/50"
                    }`}
                  />
                )}
              </div>

              {/* 직접 입력 */}
              <div className="p-3 bg-white/3 rounded-lg border border-white/8 mb-1 space-y-2">
                <p className="text-[10px] text-white/40 font-medium">직접 입력 (HuggingFace 레포)</p>
                <input
                  type="text"
                  placeholder="author/model-name  예) turboderp/Qwen2.5-Coder-7B-Instruct-exl2"
                  value={customRepo}
                  onChange={(e) => setCustomRepo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCustomDownload()}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs outline-none focus:border-accent/50 font-mono"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="revision / branch (선택, 예: 4.0bpw)"
                    value={customRevision}
                    onChange={(e) => setCustomRevision(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomDownload()}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs outline-none focus:border-accent/50 font-mono"
                  />
                  <button
                    onClick={handleCustomDownload}
                    disabled={!customRepo.trim() || !!downloading[customRepo.trim()] || starting.has(customRepo.trim())}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-xs text-accent transition-colors disabled:opacity-40"
                  >
                    <Download size={11} />
                    {starting.has(customRepo.trim()) ? "연결 중…" : downloading[customRepo.trim()] ? `${progressPct(downloading[customRepo.trim()])}%` : "받기"}
                  </button>
                </div>
                {downloading[customRepo.trim()] && (
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${progressPct(downloading[customRepo.trim()])}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 플랫폼 + 카테고리 필터 */}
              <div className="space-y-2 mb-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-white/30">
                    {isAppleSilicon ? "🍎 Apple Silicon (MLX)" : "⚡ NVIDIA (EXL2)"}
                    &nbsp;— 추천 목록. 더 많은 모델은 →
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAppleSilicon && (
                      <button
                        onClick={() => openUrl("https://huggingface.co/mlx-community")}
                        className="flex items-center gap-1 text-[10px] text-accent/70 hover:text-accent transition-colors"
                        title="mlx-community HuggingFace 열기"
                      >
                        <ExternalLink size={9} />
                        mlx-community
                      </button>
                    )}
                    {!isAppleSilicon && (
                      <button
                        onClick={() => openUrl("https://huggingface.co/turboderp")}
                        className="flex items-center gap-1 text-[10px] text-accent/70 hover:text-accent transition-colors"
                        title="turboderp HuggingFace 열기"
                      >
                        <ExternalLink size={9} />
                        turboderp (EXL2)
                      </button>
                    )}
                    <button
                      onClick={() => openUrl("https://huggingface.co/models?pipeline_tag=text-generation&sort=trending")}
                      className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                      title="HuggingFace 전체 모델 검색"
                    >
                      <ExternalLink size={9} />
                      전체 검색
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {([["all", "전체"], ...Object.entries(CATEGORY_META).map(([k, v]) => [k, `${v.icon} ${v.label}`])] as [string, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setCategoryFilter(key as ModelCategory | "all")}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        categoryFilter === key
                          ? "bg-accent/25 text-accent border border-accent/30"
                          : "bg-white/5 text-white/40 hover:text-white/70 border border-white/8"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(isAppleSilicon ? MLX_MODELS : CURATED_MODELS)
                .filter((m) => categoryFilter === "all" || m.category === categoryFilter)
                .map((m) => {
                  const prog = downloading[m.repo_id];
                  const isStarting = starting.has(m.repo_id);

                  return (
                    <div
                      key={m.repo_id}
                      className={`p-3 bg-white/5 rounded-lg border transition-colors ${
                        m.badge ? "border-accent/25" : "border-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-white/25">{CATEGORY_META[m.category].icon}</span>
                            <span className="text-xs font-medium truncate">{m.label}</span>
                            {m.badge && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-accent/20 text-accent rounded-full whitespace-nowrap">
                                {m.badge}
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
