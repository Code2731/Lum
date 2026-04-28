import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Trash2, X, HardDrive, ExternalLink } from "lucide-react";
import { shortPath } from "../utils";

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
  const [mistralBusy, setMistralBusy] = useState(false);
  // 역할 지정 — coding/doc은 config에 저장(향후 HTTP 폴백 시 사용), heavy는 85b 이후 dead
  const [codingModel, setCodingModel] = useState<string | null>(null);
  const [docModel, setDocModel] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  // 삭제 확정 다이얼로그 상태 — safe_name 기준
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // 갱신 버튼 — heavy_presets repo 살아있음 여부
  type RepoState = "alive" | "gated" | "dead" | "error";
  const [repoStatus, setRepoStatus] = useState<Record<string, RepoState>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

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
      // 인증 에러 — 토큰 입력 강조
      if (msg.includes("401") || msg.includes("403") || msg.includes("인증")) {
        setShowToken(true);
        setTokenHighlight(true);
        setTimeout(() => {
          tokenRef.current?.focus();
          setTokenHighlight(false);
        }, 300);
      }
    } finally {
      setMistralBusy(false);
    }
  }, [mistralBusy, refreshMistralLocal]);

  /** heavy_presets repo 일괄 살아있음 검사 */
  const refreshRepoStatus = useCallback(async () => {
    if (isRefreshing || catalogLoading) return;
    const presets = catalog.heavy_presets;
    if (presets.length === 0) return;
    setIsRefreshing(true);
    setRefreshMsg("HuggingFace API 조회 중...");
    try {
      const queries = presets.map((p) => ({ repo_id: p.id, revision: "main" }));
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
      setDeleteConfirm(null);
    }
  }, [refreshMistralLocal]);

  useEffect(() => {
    invoke<{ hf_token?: string; coding_model?: string; doc_model?: string }>("load_app_config")
      .then((c) => {
        if (c.hf_token) setHfToken(c.hf_token);
        setCodingModel(c.coding_model ?? null);
        setDocModel(c.doc_model ?? null);
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
                <div className="text-[10px] text-white/20 mt-1">다운로드 탭에서 mistral.rs용 모델을 받으세요.</div>
              </div>
            ) : (
              <>
                {loadMsg && (
                  <div className="mb-2 px-3 py-2 rounded text-[11px] bg-white/5 border border-white/10">{loadMsg}</div>
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
                              <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-blue-400/15 text-blue-300 rounded-full">💻 코딩</span>
                            )}
                            {isDoc && (
                              <span className="shrink-0 text-[9px] px-1.5 py-0.5 bg-purple-400/15 text-purple-300 rounded-full">📄 문서</span>
                            )}
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">
                            {formatMb(m.size_mb)} · <span className="text-white/30 font-mono">{safeName}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {deleteConfirm === safeName ? (
                            <>
                              <span className="text-[10px] text-red-400">삭제?</span>
                              <button
                                onClick={() => handleDeleteMistral(m.path)}
                                disabled={deleting === safeName}
                                className="px-2 py-1 rounded bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-medium disabled:opacity-50 transition-colors"
                              >
                                {deleting === safeName ? "삭제 중..." : "확인"}
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
                              onClick={() => setDeleteConfirm(safeName)}
                              disabled={deleting === safeName}
                              className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                              title={`~/.lum_mistral_models/${safeName}/ 폴더 삭제`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pl-0.5">
                        <span className="text-[10px] text-white/30">역할:</span>
                        <button
                          onClick={() => assignRole("coding", m.repo_id)}
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
                          onClick={() => assignRole("doc", m.repo_id)}
                          disabled={isDoc}
                          className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
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

              {/* 🚀 HuggingFace 모델 — mistral.rs용 (BF16 + GGUF) */}
              <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-400/20 mb-1 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-purple-300 font-medium">🚀 HuggingFace 모델 (mistral.rs)</p>
                  <span className="text-[9px] text-white/30">→ ~/.lum_mistral_models/</span>
                </div>
                <p className="text-[9px] text-white/40">
                  BF16 원본·GGUF 양자화 모두 OK. mistral.rs가 ISQ로 즉석 양자화. (예: <code>Qwen/Qwen3-8B</code>)
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

                {/* 추천 프리셋 */}
                {catalog.heavy_presets.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[9px] text-white/40">추천 프리셋 (클릭 → 받기):</p>
                      <button
                        onClick={refreshRepoStatus}
                        disabled={isRefreshing || catalogLoading}
                        className="flex items-center gap-1 text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors disabled:opacity-40"
                        title="각 모델의 HF 리포지토리가 살아있는지 일괄 확인"
                      >
                        {isRefreshing ? "🔄 조회 중..." : "🔄 갱신"}
                      </button>
                    </div>
                    {refreshMsg && (
                      <div className="text-[10px] text-white/50 mb-1 px-1">{refreshMsg}</div>
                    )}
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

              {/* 외부 링크 */}
              <div className="flex items-center gap-3 px-1 pt-1">
                <button
                  onClick={() => openUrl("https://huggingface.co/models?pipeline_tag=text-generation&sort=trending")}
                  className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                  title="HuggingFace 전체 모델 검색"
                >
                  <ExternalLink size={9} />
                  HuggingFace 전체 검색
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelManager;
