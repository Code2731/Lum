import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Trash2, X, HardDrive, Cpu, ExternalLink, Play, CheckCircle2, XCircle } from "lucide-react";

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
  /** 프론트엔드가 누적 집계 — 지금까지 완료된 파일 수 */
  _filesCompleted?: number;
  /** 프론트엔드가 누적 집계 — 지금까지 다운받은 총 바이트 (완료된 파일 합) */
  _totalDownloaded?: number;
  _seenFiles?: string[];
}

import { useModelCatalog, type ModelCategory, type CuratedModel } from "../hooks/useModelCatalog";

const CATEGORY_META: Record<ModelCategory, { icon: string; label: string }> = {
  coding:     { icon: "💻", label: "코딩" },
  general:    { icon: "🌐", label: "범용" },
  reasoning:  { icon: "🧠", label: "추론" },
  lightweight:{ icon: "⚡", label: "경량" },
};

// ── Apple Silicon (MLX) ───────────────────────────────────────────

interface Props {
  onClose: () => void;
  recommendedModel?: string;
  gpuVramGb?: number;        // Windows 외장 GPU VRAM
  totalMemoryGb?: number;    // Mac 통합 메모리 또는 시스템 RAM
}

const ModelManager: React.FC<Props> = ({ onClose, recommendedModel: _recommendedModel, gpuVramGb, totalMemoryGb }) => {
  const { catalog, loading: catalogLoading } = useModelCatalog();
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
  // Heavy(mistral.rs) 일반 HF 모델 다운로드 — repo만 받음 (revision=main)
  const [mistralRepo, setMistralRepo] = useState("");
  const [mistralLog, setMistralLog] = useState<string[]>([]);
  const [mistralBusy, setMistralBusy] = useState(false);
  const [mistralLocal, setMistralLocal] = useState<Array<{ repo_id: string; path: string; size_mb: number }>>([]);
  const [isAppleSilicon, setIsAppleSilicon] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">("all");
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<{ percent: number; done: boolean; error?: string } | null>(null);
  const [codingModel, setCodingModel] = useState<string | null>(null);
  const [docModel, setDocModel] = useState<string | null>(null);
  const [mistralModel, setMistralModel] = useState<string | null>(null);
  // 갱신 버튼 — repo+revision 쌍별 HF API 살아있음 여부
  type RepoState = "alive" | "gated" | "dead" | "error";
  const [repoStatus, setRepoStatus] = useState<Record<string, RepoState>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  /** key 헬퍼 — repo + revision을 안전한 단일 키로 */
  const repoKey = (repoId: string, revision: string) => `${repoId}@${revision}`;

  const refreshRoles = useCallback(() => {
    invoke<{ coding_model?: string; doc_model?: string; mistral_rs_model?: string }>("load_app_config")
      .then((c) => {
        setCodingModel(c.coding_model ?? null);
        setDocModel(c.doc_model ?? null);
        setMistralModel(c.mistral_rs_model ?? null);
      })
      .catch(() => {});
  }, []);

  /** mistral.rs 로컬 폴더 스캔 — 설치됨 탭 그룹 표시용 */
  const refreshMistralLocal = useCallback(async () => {
    try {
      const list = await invoke<Array<{ repo_id: string; path: string; size_mb: number }>>("list_mistral_models");
      setMistralLocal(list);
    } catch {
      setMistralLocal([]);
    }
  }, []);

  /** HF 일반 모델을 mistral.rs용으로 다운로드 — `download_mistral_model` Tauri 커맨드.
   *  ggufFile Some이면 GGUF 단일 파일만 받음 (~17GB 정도), 아니면 BF16 전체 받음 (수십 GB). */
  const handleMistralDownload = useCallback(async (repoId: string, ggufFile?: string) => {
    if (mistralBusy) return;
    const id = repoId.trim();
    if (!id) return;
    setMistralBusy(true);
    const kind = ggufFile ? `GGUF ${ggufFile}` : "BF16 전체";
    setMistralLog((prev) => [...prev, `📥 다운로드 시작 (${kind}): ${id}`]);
    try {
      const path = await invoke<string>("download_mistral_model", {
        repoId: id,
        ggufFilename: ggufFile ?? null,
      });
      setMistralLog((prev) => [...prev, `✅ 완료: ${path}`]);
      await refreshMistralLocal();
    } catch (e) {
      const raw = (e as { message?: string } | string | null);
      const msg = typeof raw === "string" ? raw : raw?.message ?? String(e);
      setMistralLog((prev) => [...prev, `❌ ${msg}`]);
    } finally {
      setMistralBusy(false);
    }
  }, [mistralBusy, refreshMistralLocal]);

  /** HF API에서 현재 리스트의 모든 repo+revision 살아있음 여부 일괄 확인 */
  const refreshRepoStatus = useCallback(async () => {
    if (isRefreshing || catalogLoading) return;
    const list = isAppleSilicon ? catalog.mlx : catalog.exl2;
    const presets = catalog.heavy_presets;
    if (list.length === 0 && presets.length === 0) return;
    setIsRefreshing(true);
    setRefreshMsg("HuggingFace API 조회 중...");
    try {
      const queries = [
        ...list.map((m) => ({ repo_id: m.repo_id, revision: m.revision })),
        // heavy_presets는 보통 main branch 기준
        ...presets.map((p) => ({ repo_id: p.id, revision: "main" })),
      ];
      const results = await invoke<Array<{ repo_id: string; revision: string; status: RepoState; http_code: number }>>(
        "check_repo_status",
        { repos: queries }
      );
      const map: Record<string, RepoState> = {};
      let alive = 0, gated = 0, dead = 0, err = 0;
      for (const r of results) {
        map[repoKey(r.repo_id, r.revision)] = r.status;
        if (r.status === "alive") alive++;
        else if (r.status === "gated") gated++;
        else if (r.status === "dead") dead++;
        else err++;
      }
      setRepoStatus(map);
      setRefreshMsg(`✅ 살아있음 ${alive} · 🔒 게이트 ${gated} · ❌ 사라짐 ${dead}${err ? ` · ⚠ 오류 ${err}` : ""}`);
    } catch (e) {
      setRefreshMsg(`갱신 실패: ${(e as Error)?.message ?? e}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, catalogLoading, isAppleSilicon, catalog.mlx, catalog.exl2, catalog.heavy_presets]);

  const assignRole = useCallback(async (role: "coding" | "doc" | "heavy", modelId: string) => {
    try {
      // 전체 설정 로드 후 해당 역할만 변경 (다른 xLLM 설정 유지)
      const cfg = await invoke<Record<string, unknown>>("load_app_config");
      const patch: Record<string, unknown> =
        role === "coding" ? { coding_model: modelId } :
        role === "doc"    ? { doc_model: modelId } :
                            { mistral_rs_model: modelId, mistral_rs_enabled: true };
      const merged: Record<string, unknown> = { ...cfg, ...patch };
      await invoke("save_xllm_settings", {
        serverUrl: merged["xllm_base_url"] ?? null,
        cacheMode: merged["cache_mode"] ?? null,
        codingModel: merged["coding_model"] ?? null,
        docModel: merged["doc_model"] ?? null,
        pdThresholdChars: merged["pd_threshold_chars"] ?? null,
        maxSeqLen: merged["max_seq_len"] ?? null,
        draftModel: merged["draft_model"] ?? null,
        speculativeNDraft: merged["speculative_n_draft"] ?? null,
        sparseAttention: merged["sparse_attention"] ?? null,
        sparseTopK: merged["sparse_top_k"] ?? null,
        mistralRsEnabled: merged["mistral_rs_enabled"] ?? null,
        mistralRsUrl: merged["mistral_rs_url"] ?? null,
        mistralRsModel: merged["mistral_rs_model"] ?? null,
        mistralRsIsq: merged["mistral_rs_isq"] ?? null,
        mistralRsGgufFile: merged["mistral_rs_gguf_file"] ?? null,
      });
      if (role === "coding") setCodingModel(modelId);
      else if (role === "doc") setDocModel(modelId);
      else setMistralModel(modelId);
      const roleLabel = role === "coding" ? "코딩" : role === "doc" ? "문서" : "Heavy Track (mistral.rs)";
      setLoadMsg(`✅ ${modelId} → ${roleLabel}`);
    } catch (e) {
      const raw = e as { message?: string } | string | null;
      const msg = typeof raw === "string" ? raw : (raw?.message ?? JSON.stringify(raw));
      setLoadMsg(`❌ 역할 지정 실패: ${msg}`);
    }
  }, []);

  const fetchLoaded = useCallback(() => {
    invoke<{ id: string }>("get_xllm_model_info")
      .then((info) => setLoadedModelId(info?.id && info.id !== "unknown" ? info.id : null))
      .catch(() => setLoadedModelId(null));
  }, []);

  // MLX-LM 시작 진행률 이벤트 수신
  useEffect(() => {
    const unlisten = listen<{ percent: number; done: boolean; error?: string }>(
      "mlx_download_progress",
      (e) => {
        setLoadProgress(e.payload);
        if (e.payload.done) {
          fetchLoaded();
          setTimeout(() => setLoadProgress(null), e.payload.error ? 8000 : 3000);
        }
      },
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [fetchLoaded]);

  const useModel = useCallback(async (modelId: string, modelPath?: string) => {
    setLoadingModel(modelId);
    setLoadMsg(null);
    setLoadProgress({ percent: 0, done: false });
    try {
      if (isAppleSilicon) {
        // MLX-LM은 동적 모델 전환 미지원 — 로컬 경로로 서버 재시작
        // port:0 → 백엔드에서 실행 중인 포트 자동 감지 (하드코딩 5000 제거)
        const target = modelPath ?? modelId.replace("--", "/");
        await invoke("restart_with_model", { port: 0, model: target });
        // 진행률은 아래 progress 이벤트 리스너가 관리
      } else {
        const msg = await invoke<string>("switch_xllm_model", { modelName: modelId, cacheMode: null, maxSeqLen: null });
        setLoadMsg(`✅ ${msg}`);
        setLoadProgress(null);
      }
      fetchLoaded();
    } catch (e) {
      const raw = e as { message?: string } | string | null;
      const msg = typeof raw === "string" ? raw : (raw?.message ?? JSON.stringify(raw));
      setLoadMsg(`❌ ${msg}`);
      setLoadProgress(null);
    } finally {
      setLoadingModel(null);
    }
  }, [isAppleSilicon, fetchLoaded]);

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
    fetchLoaded();
    refreshRoles();
    refreshMistralLocal();
    // mistral.rs 다운로드 / 시작 / 빌드 로그 — 다운로드 패널에 인라인 표시
    const unlistenMistralLog = listen<string>("mistral_rs_log", (e) => {
      setMistralLog((prev) => {
        const next = [...prev, e.payload];
        // 너무 길어지면 자르기 — 최근 200줄만
        return next.length > 200 ? next.slice(-200) : next;
      });
    });

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
        setDownloading((prev) => {
          const existing = prev[p.repo_id];
          const seen = existing?._seenFiles ?? [];
          const isNewFile = !seen.includes(p.file);
          // 파일이 바뀌었으면 이전 파일의 total을 누적 바이트에 더함
          const addedBytes = isNewFile && existing && existing.file && existing.file !== p.file
            ? existing.total
            : 0;
          const seenFiles = isNewFile ? [...seen, p.file] : seen;
          return {
            ...prev,
            [p.repo_id]: {
              ...p,
              _filesCompleted: Math.max(0, seenFiles.length - 1),
              _totalDownloaded: (existing?._totalDownloaded ?? 0) + addedBytes,
              _seenFiles: seenFiles,
            },
          };
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenMistralLog.then((fn) => fn());
    };
  }, [loadLocalModels, refreshMistralLocal]);

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

  const handleCancelDownload = async (repoId: string) => {
    try {
      await invoke("cancel_download", { repoId });
    } catch {}
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
              <>
                {loadMsg && (
                  <div className="mb-2 px-3 py-2 rounded text-[11px] bg-white/5 border border-white/10">{loadMsg}</div>
                )}

                {/* MLX-LM 시작 진행률 바 */}
                {loadProgress && (
                  <div className={`mb-2 px-3 py-2 rounded border ${
                    loadProgress.error
                      ? "bg-red-500/5 border-red-500/30"
                      : loadProgress.done
                        ? "bg-green-500/5 border-green-500/30"
                        : "bg-accent/5 border-accent/30"
                  }`}>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className={
                        loadProgress.error ? "text-red-400" :
                        loadProgress.done ? "text-green-400" :
                        "text-accent"
                      }>
                        {loadProgress.error
                          ? "❌ 모델 로드 실패"
                          : loadProgress.done
                            ? "✅ 모델 로드 완료"
                            : "⏳ MLX-LM 서버 시작 중"}
                      </span>
                      <span className="text-white/40 font-mono">{loadProgress.percent}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          loadProgress.error ? "bg-red-400" :
                          loadProgress.done ? "bg-green-400" :
                          "bg-accent"
                        }`}
                        style={{ width: `${loadProgress.percent}%` }}
                      />
                    </div>
                    {loadProgress.error && (
                      <pre className="mt-2 text-[10px] text-red-300/70 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                        {loadProgress.error}
                      </pre>
                    )}
                    {!loadProgress.done && !loadProgress.error && (
                      <div className="text-[10px] text-white/30 mt-1.5">
                        27B 모델은 90초 이상 걸릴 수 있습니다
                      </div>
                    )}
                  </div>
                )}
                {localModels.map((m) => {
                  const isLoaded = loadedModelId === m.id;
                  const isEmpty = m.size_mb === 0;
                  const isBusy = loadingModel === m.id;
                  const isCoding = codingModel === m.id;
                  const isDoc = docModel === m.id;
                  const isHeavy = mistralModel === m.id || mistralModel === m.path;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-2 p-3 bg-white/5 rounded-lg border transition-colors ${
                        isLoaded ? "border-green-400/40" : "border-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="text-xs font-medium truncate">{m.id}</div>
                          {isLoaded && (
                            <span className="shrink-0 flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-green-400/15 text-green-300 rounded-full">
                              <CheckCircle2 size={9} /> 로드됨
                            </span>
                          )}
                          {isCoding && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-blue-400/15 text-blue-300 rounded-full">💻 코딩</span>
                          )}
                          {isDoc && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-purple-400/15 text-purple-300 rounded-full">📄 문서</span>
                          )}
                          {isHeavy && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-pink-400/15 text-pink-300 rounded-full">🚀 Heavy</span>
                          )}
                        </div>
                        <div className="text-[10px] text-white/40 mt-0.5">
                          {isEmpty ? "빈 폴더 (다운로드 미완료)" : formatMb(m.size_mb)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isEmpty && !isLoaded && (
                          <button
                            onClick={() => useModel(m.id, m.path)}
                            disabled={isBusy || !!loadingModel}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-accent text-[10px] font-medium disabled:opacity-50 transition-colors"
                          >
                            <Play size={11} />
                            {isBusy ? (isAppleSilicon ? "재시작 중…" : "로드 중…") : (isAppleSilicon ? "재시작" : "사용")}
                          </button>
                        )}
                        {deleteConfirm === m.id ? (
                          <>
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
                          </>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(m.id)}
                            disabled={deleting === m.id}
                            className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      </div>

                      {!isEmpty && (
                        <div className="flex items-center gap-1.5 pl-0.5">
                          <span className="text-[10px] text-white/30">역할:</span>
                          <button
                            onClick={() => assignRole("coding", m.id)}
                            disabled={isCoding}
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                              isCoding
                                ? "bg-blue-400/20 text-blue-300 cursor-default"
                                : "bg-white/5 hover:bg-blue-400/10 text-white/50 hover:text-blue-300"
                            }`}
                          >
                            💻 코딩용으로 지정
                          </button>
                          <button
                            onClick={() => assignRole("doc", m.id)}
                            disabled={isDoc}
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                              isDoc
                                ? "bg-purple-400/20 text-purple-300 cursor-default"
                                : "bg-white/5 hover:bg-purple-400/10 text-white/50 hover:text-purple-300"
                            }`}
                          >
                            📄 문서용으로 지정
                          </button>
                          <button
                            onClick={() => assignRole("heavy", m.path ?? m.id)}
                            disabled={isHeavy}
                            title="!! 접두사로 호출 — mistral.rs Heavy Track에 로컬 경로 지정"
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                              isHeavy
                                ? "bg-pink-400/20 text-pink-300 cursor-default"
                                : "bg-white/5 hover:bg-pink-400/10 text-white/50 hover:text-pink-300"
                            }`}
                          >
                            🚀 Heavy 지정 (mistral.rs)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
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

              {/* ⚡ EXL2 직접 입력 — TabbyAPI Fast Track */}
              <div className="p-3 bg-white/3 rounded-lg border border-white/8 mb-1 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-white/50 font-medium">⚡ EXL2 직접 입력 — TabbyAPI Fast Track</p>
                  <span className="text-[9px] text-white/30">→ ~/tabby/models/</span>
                </div>
                <input
                  type="text"
                  placeholder="author/model-name (EXL2 양자화)  예) bartowski/Qwen2.5-Coder-7B-Instruct-exl2"
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
                  {downloading[customRepo.trim()] ? (
                    <button
                      onClick={() => handleCancelDownload(customRepo.trim())}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/30 text-red-400 text-xs transition-colors"
                      title="다운로드 취소"
                    >
                      <XCircle size={11} />
                      취소
                    </button>
                  ) : (
                    <button
                      onClick={handleCustomDownload}
                      disabled={!customRepo.trim() || starting.has(customRepo.trim())}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-xs text-accent transition-colors disabled:opacity-40"
                    >
                      <Download size={11} />
                      {starting.has(customRepo.trim()) ? "연결 중…" : "받기"}
                    </button>
                  )}
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

              {/* 🚀 HuggingFace 일반 모델 — mistral.rs Heavy Track */}
              <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-400/20 mb-1 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-purple-300 font-medium">🚀 HuggingFace 일반 모델 — mistral.rs Heavy Track</p>
                  <span className="text-[9px] text-white/30">→ ~/.lum_mistral_models/</span>
                </div>
                <p className="text-[9px] text-white/40">
                  EXL2 양자화 안 된 BF16 원본도 OK. mistral.rs가 ISQ로 즉석 양자화. (예: <code>Qwen/Qwen3-8B</code>)
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="author/model-name  예) Qwen/Qwen3-8B"
                    value={mistralRepo}
                    onChange={(e) => setMistralRepo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleMistralDownload(mistralRepo)}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs outline-none focus:border-purple-400/50 font-mono"
                  />
                  <button
                    onClick={() => handleMistralDownload(mistralRepo)}
                    disabled={!mistralRepo.trim() || mistralBusy}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-xs text-purple-300 transition-colors disabled:opacity-40"
                  >
                    <Download size={11} />
                    {mistralBusy ? "받는 중…" : "받기"}
                  </button>
                </div>

                {/* Heavy 추천 프리셋 */}
                {catalog.heavy_presets.length > 0 && (
                  <div>
                    <p className="text-[9px] text-white/40 mb-1">추천 프리셋 (클릭 → 받기):</p>
                    <div className="flex flex-wrap gap-1">
                      {catalog.heavy_presets.map((p) => {
                        const s = repoStatus[repoKey(p.id, "main")];
                        const isDead = s === "dead";
                        const installed = mistralLocal.some((m) => m.repo_id === p.id);
                        const isGguf = !!p.gguf_file;
                        return (
                          <button
                            key={`${p.id}::${p.gguf_file ?? ""}`}
                            onClick={() => { setMistralRepo(p.id); handleMistralDownload(p.id, p.gguf_file); }}
                            disabled={mistralBusy || isDead}
                            title={isDead ? "리포지토리 404 — 다운로드 불가" : `${p.id}${p.gguf_file ? ` / ${p.gguf_file}` : ""} (${p.size})`}
                            className={`text-[10px] px-2 py-0.5 rounded transition-colors disabled:opacity-30 ${
                              installed ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/25" :
                              isDead ? "bg-red-500/10 text-red-300/70 border border-red-400/20 line-through" :
                              s === "alive" ? "bg-purple-500/15 text-purple-200 border border-purple-400/25" :
                              "bg-white/5 text-white/60 border border-white/10 hover:bg-purple-500/15"
                            }`}
                          >
                            <span className="opacity-70 mr-1">{p.tag}</span>{p.label}
                            <span className="opacity-50 ml-1">· {p.size}</span>
                            {isGguf && <span className="opacity-60 ml-1">[GGUF]</span>}
                            {installed && <span className="ml-1">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 다운로드 로그 패널 */}
                {(mistralBusy || mistralLog.length > 0) && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span>📋 mistral.rs 로그 ({mistralLog.length}줄)</span>
                      {mistralLog.length > 0 && (
                        <button
                          onClick={() => setMistralLog([])}
                          className="text-white/30 hover:text-white/60 transition-colors text-[9px]"
                        >
                          지우기
                        </button>
                      )}
                    </div>
                    <div className="bg-black/40 border border-purple-400/15 rounded p-2 max-h-32 overflow-y-auto font-mono text-[10px] leading-tight">
                      {mistralLog.map((line, idx) => (
                        <div key={idx} className={line.startsWith("❌") ? "text-red-400" : line.startsWith("✅") ? "text-emerald-400" : line.startsWith("📥") ? "text-purple-300" : "text-white/60"}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 플랫폼 + 카테고리 필터 */}
              <div className="space-y-2 mb-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-white/30">
                    {isAppleSilicon ? "🍎 Apple Silicon (MLX)" : "⚡ NVIDIA (EXL2) — TabbyAPI Fast Track"}
                    &nbsp;추천 목록. 더 많은 모델은 →
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
                    <button
                      onClick={refreshRepoStatus}
                      disabled={isRefreshing || catalogLoading}
                      className="flex items-center gap-1 text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors disabled:opacity-40"
                      title="각 모델의 HF 리포지토리가 살아있는지 일괄 확인"
                    >
                      {isRefreshing ? "🔄 조회 중..." : "🔄 갱신"}
                    </button>
                  </div>
                </div>
                {refreshMsg && (
                  <div className="text-[10px] text-white/50 px-1">{refreshMsg}</div>
                )}
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

              {catalogLoading && (
                <div className="text-center text-white/40 text-xs py-4">📋 모델 카탈로그 로딩 중...</div>
              )}
              {!catalogLoading && (isAppleSilicon ? catalog.mlx : catalog.exl2).length === 0 && (
                <div className="text-center text-white/40 text-xs py-4">
                  ⚠ models.json 로드 실패 — public/models.json 파일을 확인하세요
                </div>
              )}
              {(() => {
                // Mac: 통합 메모리(totalMemoryGb) 기준, Windows: GPU VRAM 기준
                const availableGb = isAppleSilicon ? totalMemoryGb : gpuVramGb;
                const list = (isAppleSilicon ? catalog.mlx : catalog.exl2)
                  .filter((m) => categoryFilter === "all" || m.category === categoryFilter);
                // 정렬 우선순위: 호환(VRAM 맞음) > 비호환, 호환 내에선 badge 있는 추천 우선.
                // 동순위 내에선 원본 배열 순서 유지(stable sort).
                const sorted = [...list].sort((a, b) => {
                  const aFits = availableGb ? a.min_ram_gb <= availableGb : true;
                  const bFits = availableGb ? b.min_ram_gb <= availableGb : true;
                  if (aFits !== bFits) return aFits ? -1 : 1;
                  const aBadge = !!a.badge;
                  const bBadge = !!b.badge;
                  if (aBadge !== bBadge) return aBadge ? -1 : 1;
                  return 0;
                });
                return sorted;
              })()
                .map((m) => {
                  const prog = downloading[m.repo_id];
                  const isStarting = starting.has(m.repo_id);
                  const availableGb = isAppleSilicon ? totalMemoryGb : gpuVramGb;
                  const isUnsupported = availableGb !== undefined && m.min_ram_gb > availableGb;
                  const memLabel = isAppleSilicon ? "RAM" : "VRAM";

                  return (
                    <div
                      key={`${m.repo_id}@${m.revision}`}
                      className={`p-3 bg-white/5 rounded-lg border transition-colors ${
                        isUnsupported ? "border-white/5 opacity-50" : m.badge ? "border-accent/25" : "border-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-white/25">{CATEGORY_META[m.category].icon}</span>
                            <span className="text-xs font-medium truncate">{m.label}</span>
                            {m.badge && !isUnsupported && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-accent/20 text-accent rounded-full whitespace-nowrap">
                                {m.badge}
                              </span>
                            )}
                            {m.capabilities?.vision && (
                              <span title="이미지 입력 지원 (Vision)" className="text-[9px] px-1.5 py-0.5 bg-purple-400/15 text-purple-300/80 rounded-full whitespace-nowrap">
                                👁 비전
                              </span>
                            )}
                            {m.capabilities?.reasoning && (
                              <span title="Chain-of-Thought 추론 토큰 생성" className="text-[9px] px-1.5 py-0.5 bg-cyan-400/15 text-cyan-300/80 rounded-full whitespace-nowrap">
                                🧠 추론
                              </span>
                            )}
                            {isUnsupported && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-red-500/15 text-red-300/80 rounded-full whitespace-nowrap">
                                {memLabel} 부족
                              </span>
                            )}
                            {(() => {
                              const s = repoStatus[repoKey(m.repo_id, m.revision)];
                              if (s === "alive") return (
                                <span title="HF API 200 — 다운로드 가능" className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300/80 rounded-full whitespace-nowrap">
                                  ✓ 살아있음
                                </span>
                              );
                              if (s === "gated") return (
                                <span title="HF API 401/403 — 인증 토큰 필요 (gated 모델)" className="text-[9px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300/80 rounded-full whitespace-nowrap">
                                  🔒 게이트
                                </span>
                              );
                              if (s === "dead") return (
                                <span title="HF API 404 — 리포지토리 또는 revision 없음" className="text-[9px] px-1.5 py-0.5 bg-red-500/15 text-red-300/80 rounded-full whitespace-nowrap">
                                  ❌ 사라짐
                                </span>
                              );
                              if (s === "error") return (
                                <span title="HF API 응답 비정상 (네트워크/rate-limit 등)" className="text-[9px] px-1.5 py-0.5 bg-white/10 text-white/40 rounded-full whitespace-nowrap">
                                  ⚠ 오류
                                </span>
                              );
                              return null;
                            })()}
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">{m.description}</div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30">
                            <span className="flex items-center gap-1">
                              <HardDrive size={9} /> ~{m.size_gb} GB
                            </span>
                            <span className="flex items-center gap-1">
                              <Cpu size={9} /> {memLabel} {m.min_ram_gb}GB+
                            </span>
                          </div>
                        </div>
                        {prog ? (
                          <button
                            onClick={() => handleCancelDownload(m.repo_id)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-500/15 hover:bg-red-500/30 text-red-400 text-xs transition-colors"
                            title="다운로드 취소"
                          >
                            <XCircle size={11} />
                            취소
                          </button>
                        ) : (() => {
                          const s = repoStatus[repoKey(m.repo_id, m.revision)];
                          const isDead = s === "dead";
                          return (
                            <button
                              onClick={() => handleDownload(m)}
                              disabled={isStarting || isDead}
                              title={isDead ? "리포지토리 404 — 다운로드 불가 (모델 ID/revision이 사라짐)" : undefined}
                              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-accent/20 text-xs transition-colors disabled:opacity-50"
                            >
                              <Download size={11} />
                              {isStarting ? "연결 중…" : isDead ? "사라짐" : "받기"}
                            </button>
                          );
                        })()}
                      </div>

                      {prog && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[9px] text-white/40">
                            <span className="truncate flex-1">
                              {prog._filesCompleted !== undefined && prog._filesCompleted > 0
                                ? `파일 ${(prog._filesCompleted ?? 0) + 1}번째`
                                : "다운로드 중"}
                              {" · "}
                              <span className="text-white/30">{prog.file}</span>
                            </span>
                            <span className="font-mono shrink-0 ml-2">{progressPct(prog)}%</span>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent transition-all duration-300"
                              style={{ width: `${progressPct(prog)}%` }}
                            />
                          </div>
                          {prog._totalDownloaded !== undefined && prog._totalDownloaded > 0 && (
                            <div className="text-[9px] text-white/25">
                              누적 {formatMb((prog._totalDownloaded + prog.downloaded) / 1024 / 1024)} 다운로드 · 여러 파일 순차 진행 (100% → 0% 반복 정상)
                            </div>
                          )}
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
