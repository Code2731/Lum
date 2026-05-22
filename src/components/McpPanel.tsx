import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus, Plug, PlugZap, Trash2, RefreshCw, Download, Play,
  ChevronDown, ChevronRight, Loader2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";

interface McpServerSpec {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  description?: string;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface McpRecommendedServer {
  name: string;
  title: string;
  command: string;
  args: string[];
  description: string;
  env_required: string[];
  env_optional: string[];
  note?: string;
}

interface McpInstallRecommendedResult {
  installed: McpServerSpec;
  tool_count: number;
  tools_preview: string[];
}

interface Props {
  onClose: () => void;
}

// 서버별 런타임 상태 (툴 목록·로딩·에러) — 3개 상태 객체를 하나로
interface ServerRuntime {
  tools?: McpTool[];
  error?: string;
  loading?: boolean;
}

const McpPanel: React.FC<Props> = ({ onClose }) => {
  const [servers, setServers] = useState<McpServerSpec[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Record<string, ServerRuntime>>({});
  const [installing, setInstalling] = useState(false);
  const [recommended, setRecommended] = useState<McpRecommendedServer[]>([]);
  const [installingRecommended, setInstallingRecommended] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<McpServerSpec | null>(null);

  const patchRuntime = (name: string, patch: Partial<ServerRuntime>) =>
    setRuntime((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));

  const loadServers = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await invoke<McpServerSpec[]>("list_mcp_servers");
      setServers(list);
    } catch (e) {
      console.error("[MCP] list failed:", e);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  useEffect(() => {
    invoke<McpRecommendedServer[]>("mcp_recommended_servers")
      .then(setRecommended)
      .catch((e) => console.error("[MCP] recommended failed:", e));
  }, []);

  const saveServer = async (spec: McpServerSpec) => {
    try {
      await invoke("save_mcp_server", { spec });
      await loadServers();
    } catch (e) {
      patchRuntime(spec.name, { error: String(e) });
    }
  };

  const toggleEnabled = async (s: McpServerSpec) => {
    const next = { ...s, enabled: !s.enabled };
    if (!next.enabled) {
      // 비활성화 시 프로세스 중지
      try { await invoke("mcp_stop_server", { name: s.name }); } catch {}
    }
    await saveServer(next);
  };

  const removeServer = async (name: string) => {
    if (!confirm(`'${name}' 서버를 제거할까요?`)) return;
    try {
      await invoke("delete_mcp_server", { name });
      await loadServers();
    } catch (e) {
      alert(String(e));
    }
  };

  const expandAndLoadTools = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    if (runtime[name]?.tools) return; // 이미 로드됨
    patchRuntime(name, { loading: true, error: undefined });
    try {
      const result = await invoke<{ tools: McpTool[] }>("mcp_list_tools", { serverName: name });
      patchRuntime(name, { tools: result.tools ?? [], loading: false });
    } catch (e) {
      patchRuntime(name, { error: String(e).slice(0, 300), loading: false });
    }
  };

  const installPresets = async () => {
    setInstalling(true);
    try {
      await invoke<McpServerSpec[]>("mcp_install_presets");
      await loadServers();
    } catch (e) {
      alert(`프리셋 설치 실패: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  const installRecommended = async (rec: McpRecommendedServer) => {
    const env: Record<string, string> = {};
    for (const key of rec.env_required) {
      const value = window.prompt(`${rec.title} 설치에 필요한 ${key} 값을 입력하세요:`, "");
      if (value === null) return; // 사용자가 취소
      if (!value.trim()) {
        alert(`${key} 값이 비어있습니다.`);
        return;
      }
      env[key] = value.trim();
    }
    setInstallingRecommended(rec.name);
    try {
      const result = await invoke<McpInstallRecommendedResult>("mcp_install_recommended", {
        name: rec.name,
        env,
      });
      await loadServers();
      setExpanded(rec.name);
      patchRuntime(rec.name, { tools: result.tools_preview.map((name) => ({ name })) });
      alert(
        `${rec.title} 설치 완료\n- tools: ${result.tool_count}개\n- preview: ${result.tools_preview.join(", ")}`
      );
    } catch (e) {
      alert(`설치 실패 (${rec.title}): ${String(e)}`);
    } finally {
      setInstallingRecommended(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="lum-sidepanel sm:max-w-[640px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden border-white/12 rounded-2xl">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <PlugZap size={14} className="text-accent" />
            <DialogTitle className="text-sm font-semibold text-white/90">MCP 서버</DialogTitle>
            <span className="text-xs text-white/35">· Model Context Protocol</span>
          </div>
          <IconButton tooltip="새로고침" onClick={loadServers}
            className="p-1 rounded border border-white/[0.1] text-white/40 hover:text-white/78 hover:bg-white/[0.08] mr-8">
            <RefreshCw size={12} className={loadingList ? "animate-spin" : ""} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {recommended.length > 0 && (
            <div className="p-3 rounded-lg border border-white/10 bg-white/[0.03] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/76 font-semibold">추천 서버 (원클릭 설치)</div>
                <span className="text-xs text-white/35">{recommended.length}개</span>
              </div>
              <div className="space-y-1.5">
                {recommended.map((rec) => {
                  const installed = servers.some((s) => s.name === rec.name);
                  const busy = installingRecommended === rec.name;
                  return (
                    <div
                      key={rec.name}
                      className="rounded border border-white/10 bg-black/22 px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm text-white/85 font-medium">
                            {rec.title}
                            <span className="ml-1 text-xs text-white/35 font-mono">({rec.name})</span>
                          </div>
                          <div className="text-xs text-white/45 truncate">
                            {rec.description}
                          </div>
                        </div>
                        <button
                          onClick={() => installRecommended(rec)}
                          disabled={busy}
                          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-accent/35 bg-accent/18 hover:bg-accent/30 text-accent text-xs disabled:opacity-50"
                        >
                          {busy ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                          {installed ? "재설치" : "설치"}
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-white/30 font-mono break-all">
                        {rec.command} {rec.args.join(" ")}
                      </div>
                      {(rec.env_required.length > 0 || rec.env_optional.length > 0) && (
                        <div className="mt-1 text-xs text-amber-300/80">
                          env: [
                          {rec.env_required.map((k) => `${k}*`).join(", ")}
                          {rec.env_required.length > 0 && rec.env_optional.length > 0 ? ", " : ""}
                          {rec.env_optional.join(", ")}
                          ]
                        </div>
                      )}
                      {rec.note && (
                        <div className="mt-1 text-xs text-white/35">{rec.note}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {servers.length === 0 && !loadingList && (
            <div className="p-4 bg-white/[0.03] border border-white/[0.1] rounded-lg text-center space-y-2">
              <p className="text-xs text-white/60">등록된 MCP 서버가 없습니다.</p>
              <button
                onClick={installPresets}
                disabled={installing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent/35 bg-accent/18 hover:bg-accent/30 text-accent text-sm transition-colors disabled:opacity-50"
              >
                {installing ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                공식 프리셋 설치 (filesystem · playwright · git)
              </button>
            </div>
          )}

          {servers.map((s) => {
            const isExpanded = expanded === s.name;
            const rt = runtime[s.name] ?? {};
            const err = rt.error;
            const serverTools = rt.tools;
            return (
              <div key={s.name} className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => expandAndLoadTools(s.name)}
                    className="flex items-center gap-1 flex-1 text-left text-xs hover:text-white transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <Plug size={11} className={s.enabled ? "text-accent" : "text-white/30"} />
                    <span className={s.enabled ? "text-white/90 font-medium" : "text-white/50"}>
                      {s.name}
                    </span>
                    {s.description && (
                      <span className="text-xs text-white/30 ml-1 truncate">· {s.description}</span>
                    )}
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={() => toggleEnabled(s)}
                      className="scale-75"
                    />
                    <span className="text-xs text-white/40">{s.enabled ? "활성" : "꺼짐"}</span>
                  </label>
                  <IconButton
                    tooltip="제거"
                    confirm={{
                      title: "MCP 서버 제거",
                      description: <><span className="font-medium text-white/85">"{s.name}"</span> 서버 설정이 삭제됩니다. 실행 중이면 중단됩니다.</>,
                      confirmLabel: "제거",
                    }}
                    onClick={() => removeServer(s.name)}
                    className="p-1 rounded border border-transparent text-white/35 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/25"
                  >
                    <Trash2 size={11} />
                  </IconButton>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/8 p-3 space-y-2 bg-black/12">
                    <div className="font-mono text-xs text-white/40 break-all">
                      <span className="text-white/30">$ </span>
                      {s.command} {s.args.join(" ")}
                    </div>

                    {rt.loading && (
                      <div className="flex items-center gap-1.5 text-sm text-white/50">
                        <Loader2 size={11} className="animate-spin" /> 툴 목록 조회 중…
                      </div>
                    )}

                    {err && (
                      <div className="flex items-start gap-1.5 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-300">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                        <div className="font-mono whitespace-pre-wrap break-all">{err}</div>
                      </div>
                    )}

                    {serverTools && serverTools.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-white/40 uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 size={10} className="text-green-400" /> {serverTools.length}개 툴
                        </div>
                        {serverTools.map((t) => (
                          <div key={t.name} className="px-2 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded text-sm">
                            <div className="flex items-center gap-1.5">
                              <Play size={9} className="text-accent/60" />
                              <span className="font-mono text-accent/90">{t.name}</span>
                            </div>
                            {t.description && (
                              <div className="text-xs text-white/40 mt-0.5 ml-4">
                                {t.description}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {serverTools && serverTools.length === 0 && !err && (
                      <div className="text-sm text-white/30 italic">툴 없음</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* 서버 추가 */}
          {addForm ? (
            <div className="p-3 rounded-lg border border-accent/35 bg-accent/8 space-y-2">
              <div className="text-xs font-medium text-accent">새 서버 추가</div>
              <Input placeholder="서버 이름 (고유)" value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                className="text-sm font-mono" />
              <Input placeholder="command (예: npx)" value={addForm.command}
                onChange={(e) => setAddForm({ ...addForm, command: e.target.value })}
                className="text-sm font-mono" />
              <Input placeholder="args (공백 구분)" value={addForm.args.join(" ")}
                onChange={(e) => setAddForm({ ...addForm, args: e.target.value.split(/\s+/).filter(Boolean) })}
                className="text-sm font-mono" />
              <Input placeholder="설명 (선택)" value={addForm.description ?? ""}
                onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                className="text-sm" />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAddForm(null)}
                  className="px-3 py-1 rounded text-sm text-white/50 hover:text-white/80"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    if (!addForm.name || !addForm.command) return;
                    await saveServer(addForm);
                    setAddForm(null);
                  }}
                  disabled={!addForm.name || !addForm.command}
                  className="px-3 py-1 rounded-md border border-accent/35 bg-accent/18 hover:bg-accent/30 text-accent text-sm disabled:opacity-40"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddForm({ name: "", command: "", args: [], env: {}, enabled: true })}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-dashed border-white/[0.22] text-white/45 hover:text-white/76 hover:border-white/35 text-sm transition-colors bg-white/[0.02]"
            >
              <Plus size={12} />
              서버 수동 추가
            </button>
          )}

          <p className="text-xs text-white/25 leading-relaxed pt-2">
            MCP = Model Context Protocol. 활성화된 서버의 툴은 AI가 스크린샷/파일/Git 등을 호출할 수 있게 해줍니다.
            <br />
            <b>Phase 74</b>: 서버 등록 + 툴 조회만 동작. AI 자동 호출은 이후 Phase에서 통합 예정.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default McpPanel;
