import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Trash2, HardDrive, ExternalLink, X, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { shortPath } from "../utils";
import { SMALL_ICON_SIZE } from "../constants/ui";

interface MistralLocalModel {
  repo_id: string;
  path: string;
  size_mb: number;
}

import { useModelCatalog } from "../hooks/useModelCatalog";

interface Props {
  onClose: () => void;
}

const ModelManager: React.FC<Props> = ({ onClose }) => {
  const { catalog, loading: catalogLoading } = useModelCatalog();
  const [tab, setTab] = useState<"installed" | "download">("installed");
  const [mistralLocal, setMistralLocal] = useState<MistralLocalModel[]>([]);
  const [hfToken, setHfToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenHighlight, setTokenHighlight] = useState(false);
  const tokenRef = useRef<HTMLInputElement>(null);
  // Heavy(mistral.rs) 다운로드 — 사용자 직접 입력 + 추천 프리셋
  const [mistralRepo, setMistralRepo] = useState("");
  const [mistralLog, setMistralLog] = useState<string[]>([]);
  // null = 대기 중, string = 현재 다운로드 중인 repo_id
  const [activeDownloadRepo, setActiveDownloadRepo] = useState<string | null>(null);
  const mistralBusy = activeDownloadRepo !== null;
  // 역할 지정 — coding/doc은 config에 저장(향후 HTTP 폴백 시 사용), heavy는 85b 이후 dead
  const [codingModel, setCodingModel] = useState<string | null>(null);
  const [docModel, setDocModel] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  // 삭제 진행 중 — safe_name 기준 (확인 모달은 ConfirmDeleteDialog가 자체 관리)
  const [deleting, setDeleting] = useState<string | null>(null);
  // 갱신 버튼 — heavy_presets repo 살아있음 여부
  type RepoState = "alive" | "gated" | "dead" | "error";
  const [repoStatus, setRepoStatus] = useState<Record<string, RepoState>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  // 모델 저장 경로
  const [modelDownloadDir, setModelDownloadDir] = useState<string | null>(null);

  const repoKey = (repoId: string, revision: string) => `${repoId}@${revision}`;

  /** mistral.rs 로컬 폴더 스캔 — 설치된 모델 탭의 데이터 소스 */
  const refreshMistralLocal = useCallback(async () => {
    try {
      const list = await invoke<MistralLocalModel[]>("list_mistral_models");
      setMistralLocal(list);
    } catch {
      setMistralLocal([]);
    }
  }, []);

  /** HF 일반 모델을 mistral.rs용으로 다운로드.
   *  ggufFile Some이면 GGUF 단일 파일만, 아니면 BF16 전체. */
  const handleMistralDownload = useCallback(async (repoId: string, ggufFile?: string) => {
    if (mistralBusy) return;
    const id = repoId.trim();
    if (!id) return;
    setActiveDownloadRepo(id);
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
      if (msg.includes("401") || msg.includes("403") || msg.includes("인증")) {
        setShowToken(true);
        setTokenHighlight(true);
        setTimeout(() => {
          tokenRef.current?.focus();
          setTokenHighlight(false);
        }, 300);
      }
    } finally {
      setActiveDownloadRepo(null);
    }
  }, [mistralBusy, refreshMistralLocal]);

  const handleCancelDownload = useCallback(async () => {
    if (!activeDownloadRepo) return;
    try {
      await invoke("cancel_mistral_download", { repoId: activeDownloadRepo });
      setMistralLog((prev) => [...prev, "⛔ 취소 요청 전송..."]);
    } catch {
      // 무시
    }
  }, [activeDownloadRepo]);

  /** heavy_presets repo 일괄 살아있음 검사 */
  const refreshRepoStatus = useCallback(async () => {
    if (isRefreshing || catalogLoading) return;
    const presets = catalog.heavy_presets;
    if (presets.length === 0) return;
    setIsRefreshing(true);
    setRefreshMsg("HuggingFace API 조회 중...");
    try {
      const queries = presets.map((p) => ({ repo_id: p.id, revision: "main", gguf_file: p.gguf_file ?? null }));
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
  }, [isRefreshing, catalogLoading, catalog.heavy_presets]);

  /** 역할 지정 — coding/doc은 AppConfig에 저장 (heavy는 85b 이후 dead라 제외) */
  const assignRole = useCallback(async (role: "coding" | "doc", modelId: string) => {
    try {
      const cfg = await invoke<Record<string, unknown>>("load_app_config");
      const merged: Record<string, unknown> = {
        ...cfg,
        ...(role === "coding" ? { coding_model: modelId } : { doc_model: modelId }),
      };
      await invoke("save_xllm_settings", {
        cacheMode: merged["cache_mode"] ?? null,
        codingModel: merged["coding_model"] ?? null,
        docModel: merged["doc_model"] ?? null,
        pdThresholdChars: merged["pd_threshold_chars"] ?? null,
        maxSeqLen: merged["max_seq_len"] ?? null,
        draftModel: merged["draft_model"] ?? null,
        speculativeNDraft: merged["speculative_n_draft"] ?? null,
      });
      if (role === "coding") setCodingModel(modelId);
      else setDocModel(modelId);
      const roleLabel = role === "coding" ? "코딩" : "문서";
      setLoadMsg(`✅ ${modelId} → ${roleLabel}`);
    } catch (e) {
      const raw = e as { message?: string } | string | null;
      const msg = typeof raw === "string" ? raw : (raw?.message ?? JSON.stringify(raw));
      setLoadMsg(`❌ 역할 지정 실패: ${msg}`);
    }
  }, []);

  const saveToken = useCallback(async (t: string) => {
    try {
      await invoke("save_hf_token", { token: t });
    } catch {
      // 저장 실패 시 무시
    }
  }, []);

  const handleSaveDownloadDir = useCallback(async (dir: string | null) => {
    setModelDownloadDir(dir);
    await invoke("save_model_download_dir", { dir });
    await refreshMistralLocal();
  }, [refreshMistralLocal]);

  const handleDeleteMistral = useCallback(async (path: string) => {
    const safeName = shortPath(path);
    if (!safeName || safeName === "~") return;
    setDeleting(safeName);
    try {
      await invoke("delete_mistral_model", { safeName });
      await refreshMistralLocal();
    } catch (e) {
      const raw = e as { message?: string } | string | null;
      const msg = typeof raw === "string" ? raw : (raw?.message ?? JSON.stringify(raw));
      setLoadMsg(`❌ 삭제 실패: ${msg}`);
    } finally {
      setDeleting(null);
    }
  }, [refreshMistralLocal]);

  useEffect(() => {
    invoke<{ hf_token?: string; coding_model?: string; doc_model?: string; model_download_dir?: string }>("load_app_config")
      .then((c) => {
        if (c.hf_token) setHfToken(c.hf_token);
        setCodingModel(c.coding_model ?? null);
        setDocModel(c.doc_model ?? null);
        setModelDownloadDir(c.model_download_dir ?? null);
      })
      .catch(() => {});
    refreshMistralLocal();
    // mistral.rs 다운로드/캐시 로그 — 200줄 cap
    const unlistenMistralLog = listen<string>("mistral_rs_log", (e) => {
      setMistralLog((prev) => {
        const next = [...prev, e.payload];
        return next.length > 200 ? next.slice(-200) : next;
      });
    });
    return () => {
      unlistenMistralLog.then((fn) => fn());
    };
  }, [refreshMistralLocal]);

  const formatMb = (mb: number) =>
    mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-xl bg-[#0f1117]">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
          <HardDrive size={16} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">모델 관리</DialogTitle>
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
              {t === "installed" ? `설치된 모델 (${mistralLocal.length})` : "다운로드"}
            </button>
          ))}
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tab === "installed" ? (
            mistralLocal.length === 0 ? (
              <div className="text-center text-white/30 py-12 text-sm">
                설치된 모델이 없습니다.
                <div className="text-xs text-white/20 mt-1">다운로드 탭에서 mistral.rs용 모델을 받으세요.</div>
              </div>
            ) : (
              <>
                {loadMsg && (
                  <div className="mb-2 px-3 py-2 rounded text-sm bg-white/5 border border-white/10">{loadMsg}</div>
                )}

                {mistralLocal.map((m) => {
                  const safeName = shortPath(m.path);
                  const isCoding = codingModel === m.repo_id || codingModel === m.path;
                  const isDoc = docModel === m.repo_id || docModel === m.path;

                  return (
                    <div
                      key={m.path}
                      className="flex flex-col gap-2 p-3 bg-white/5 rounded-lg border border-white/5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="text-xs font-medium truncate">{m.repo_id}</div>
                            {isCoding && (
                              <span className="shrink-0 text-xs px-1.5 py-0.5 bg-blue-400/15 text-blue-300 rounded-full">💻 코딩</span>
                            )}
                            {isDoc && (
                              <span className="shrink-0 text-xs px-1.5 py-0.5 bg-purple-400/15 text-purple-300 rounded-full">📄 문서</span>
                            )}
                          </div>
                          <div className="text-xs text-white/40 mt-0.5">
                            {formatMb(m.size_mb)} · <span className="text-white/30 font-mono">{safeName}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ConfirmDeleteDialog
                            itemName={m.repo_id}
                            itemType="모델"
                            description={`~/.lum_mistral_models/${safeName}/ 폴더(${formatMb(m.size_mb)})가 영구 삭제됩니다.`}
                            onConfirm={() => handleDeleteMistral(m.path)}
                          >
                            <button
                              disabled={deleting === safeName}
                              className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                              title="모델 삭제"
                            >
                              <Trash2 size={SMALL_ICON_SIZE} />
                            </button>
                          </ConfirmDeleteDialog>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pl-0.5">
                        <span className="text-xs text-white/30">역할:</span>
                        <button
                          onClick={() => assignRole("coding", m.repo_id)}
                          disabled={isCoding}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            isCoding
                              ? "bg-blue-400/20 text-blue-300 cursor-default"
                              : "bg-white/5 hover:bg-blue-400/10 text-white/50 hover:text-blue-300"
                          }`}
                        >
                          💻 코딩용으로 지정
                        </button>
                        <button
                          onClick={() => assignRole("doc", m.repo_id)}
                          disabled={isDoc}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            isDoc
                              ? "bg-purple-400/20 text-purple-300 cursor-default"
                              : "bg-white/5 hover:bg-purple-400/10 text-white/50 hover:text-purple-300"
                          }`}
                        >
                          📄 문서용으로 지정
                        </button>
                      </div>
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
                  className="text-xs text-white/30 hover:text-white/50 transition-colors"
                >
                  {showToken ? "▾" : "▸"} 게이티드/비공개 모델 (HuggingFace 토큰 필요)
                </button>
                {showToken && (
                  <Input
                    ref={tokenRef}
                    type="password"
                    placeholder="hf_xxxxxxxx…"
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    onBlur={(e) => saveToken(e.target.value)}
                    className={`mt-1.5 ${tokenHighlight ? "border-yellow-400/60 ring-1 ring-yellow-400/30" : ""}`}
                  />
                )}
              </div>

              {/* 📁 모델 저장 경로 설정 */}
              <div className="p-2.5 bg-white/3 rounded-lg border border-white/8 space-y-1.5">
                <p className="text-xs text-white/50 font-medium">📁 모델 저장 경로</p>
                <div className="flex items-center gap-1.5">
                  <span className="flex-1 text-xs font-mono text-white/60 truncate" title={modelDownloadDir ?? undefined}>
                    {modelDownloadDir ?? "~/.lum_mistral_models (기본값)"}
                  </span>
                  <button
                    onClick={async () => {
                      const picked = await invoke<string | null>("pick_model_dir");
                      if (picked) await handleSaveDownloadDir(picked);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white/80 transition-colors shrink-0"
                  >
                    <FolderOpen size={10} /> 변경
                  </button>
                  {modelDownloadDir && (
                    <button
                      onClick={() => handleSaveDownloadDir(null)}
                      className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/40 hover:text-white/60 transition-colors shrink-0"
                    >
                      기본값
                    </button>
                  )}
                </div>
              </div>

              {/* 🚀 HuggingFace 모델 — mistral.rs용 (BF16 + GGUF) */}
              <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-400/20 mb-1 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-purple-300 font-medium">🚀 HuggingFace 모델 (mistral.rs)</p>
                  <span className="text-xs text-white/30 font-mono truncate max-w-[180px]" title={modelDownloadDir ?? undefined}>
                    → {modelDownloadDir ? shortPath(modelDownloadDir) : "~/.lum_mistral_models/"}
                  </span>
                </div>
                <p className="text-xs text-white/40">
                  BF16 원본·GGUF 양자화 모두 OK. mistral.rs가 ISQ로 즉석 양자화. (예: <code>Qwen/Qwen3-8B</code>)
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="author/model-name  예) Qwen/Qwen3-8B"
                    value={mistralRepo}
                    onChange={(e) => setMistralRepo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleMistralDownload(mistralRepo);
                      }
                    }}
                    className="flex-1 focus:border-purple-400/50 font-mono"
                  />
                  {mistralBusy ? (
                    <IconButton
                      tooltip="다운로드 취소"
                      onClick={handleCancelDownload}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-xs text-red-300 transition-colors"
                    >
                      <X size={11} />
                      취소
                    </IconButton>
                  ) : (
                    <button
                      onClick={() => handleMistralDownload(mistralRepo)}
                      disabled={!mistralRepo.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-xs text-purple-300 transition-colors disabled:opacity-40"
                    >
                      <Download size={11} />
                      받기
                    </button>
                  )}
                </div>

                {/* 한국어 토큰 효율 안내 */}
                <details className="group">
                  <summary className="cursor-pointer text-xs text-yellow-400/60 hover:text-yellow-400/90 transition-colors list-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                    🇰🇷 한국어 토큰 효율 — 모델 고르는 법
                  </summary>
                  <div className="mt-1.5 p-2.5 bg-yellow-400/5 border border-yellow-400/15 rounded-lg space-y-1.5 text-xs text-white/60 leading-relaxed">
                    <p><span className="text-yellow-300/80 font-medium">tokenizer.json 확인:</span> "안녕하세요"처럼 한국어 단어가 합쳐진 토큰이 많을수록 같은 문장에 토큰을 적게 씀 → 빠르고 저렴.</p>
                    <p><span className="text-yellow-300/80 font-medium">SentencePiece 우위:</span> 최근 연구에서 SentencePiece 기반 한국어 서브워드가 BPE보다 효율적. EXAONE·EEVE·Bllossom 계열이 대표.</p>
                    <p><span className="text-yellow-300/80 font-medium">EEVE-Korean 10.8B:</span> 기본 Llama 어휘(32K) → 102K로 확장. 한국어 토큰 수 약 <span className="text-emerald-400/80">30~40% 절감</span>. 아래 프리셋 <code className="bg-white/10 px-1 rounded">🇰🇷⚡ 토큰 최적화</code> 참고.</p>
                    <p><span className="text-yellow-300/80 font-medium">크기 주의:</span> BF16 원본 다운로드 후 mistral.rs가 ISQ 양자화. RAM 여유 있을 때 사용 권장.</p>
                  </div>
                </details>

                {/* 추천 프리셋 */}
                {catalog.heavy_presets.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-white/40">추천 프리셋 (클릭 → 받기):</p>
                      <IconButton
                        tooltip="각 모델의 HF 리포지토리가 살아있는지 일괄 확인"
                        onClick={refreshRepoStatus}
                        disabled={isRefreshing || catalogLoading}
                        className="flex items-center gap-1 text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors disabled:opacity-40"
                      >
                        {isRefreshing ? "🔄 조회 중..." : "🔄 갱신"}
                      </IconButton>
                    </div>
                    {refreshMsg && (
                      <div className="text-xs text-white/50 mb-1 px-1">{refreshMsg}</div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {catalog.heavy_presets.map((p) => {
                        const s = repoStatus[repoKey(p.id, "main")];
                        const isDead = s === "dead";
                        const installed = mistralLocal.some((m) => m.repo_id === p.id);
                        const isGguf = !!p.gguf_file;
                        const isThisDownloading = activeDownloadRepo === p.id;
                        return (
                          <button
                            key={`${p.id}::${p.gguf_file ?? ""}`}
                            onClick={() => {
                              if (isThisDownloading) { handleCancelDownload(); return; }
                              setMistralRepo(p.id);
                              handleMistralDownload(p.id, p.gguf_file);
                            }}
                            disabled={!isThisDownloading && (mistralBusy || isDead)}
                            title={isDead ? "리포지토리 404 — 다운로드 불가" : isThisDownloading ? "클릭하여 취소" : `${p.id}${p.gguf_file ? ` / ${p.gguf_file}` : ""} (${p.size})`}
                            className={`text-xs px-2 py-0.5 rounded transition-colors disabled:opacity-30 ${
                              isThisDownloading ? "bg-red-500/20 text-red-300 border border-red-400/30 animate-pulse" :
                              installed ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/25" :
                              isDead ? "bg-red-500/10 text-red-300/70 border border-red-400/20 line-through" :
                              s === "alive" ? "bg-purple-500/15 text-purple-200 border border-purple-400/25" :
                              "bg-white/5 text-white/60 border border-white/10 hover:bg-purple-500/15"
                            }`}
                          >
                            {isThisDownloading && <span className="mr-1">⛔</span>}
                            <span className="opacity-70 mr-1">{p.tag}</span>{p.label}
                            <span className="opacity-50 ml-1">· {p.size}</span>
                            {isGguf && <span className="opacity-60 ml-1">[GGUF]</span>}
                            {installed && !isThisDownloading && <span className="ml-1">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 다운로드 로그 패널 */}
                {(mistralBusy || mistralLog.length > 0) && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-white/40">
                      <span>📋 mistral.rs 로그 ({mistralLog.length}줄)</span>
                      {mistralLog.length > 0 && (
                        <button
                          onClick={() => setMistralLog([])}
                          className="text-white/30 hover:text-white/60 transition-colors text-xs"
                        >
                          지우기
                        </button>
                      )}
                    </div>
                    <div className="bg-black/40 border border-purple-400/15 rounded p-2 max-h-32 overflow-y-auto font-mono text-xs leading-tight">
                      {mistralLog.map((line, idx) => (
                        <div key={idx} className={line.startsWith("❌") ? "text-red-400" : line.startsWith("✅") ? "text-emerald-400" : line.startsWith("📥") ? "text-purple-300" : "text-white/60"}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 외부 링크 */}
              <div className="flex items-center gap-3 px-1 pt-1">
                <button
                  onClick={() => openUrl("https://huggingface.co/models?pipeline_tag=text-generation&sort=trending")}
                  className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors"
                  title="HuggingFace 전체 모델 검색"
                >
                  <ExternalLink size={9} />
                  HuggingFace 전체 검색
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModelManager;
