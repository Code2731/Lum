import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X, Plus, Plug, PlugZap, Trash2, RefreshCw, Download, Play,
  ChevronDown, ChevronRight, Loader2, AlertTriangle, CheckCircle2,
} from "lucide-react";

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

interface Props {
  onClose: () => void;
}

const McpPanel: React.FC<Props> = ({ onClose }) => {
  const [servers, setServers] = useState<McpServerSpec[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingTools, setLoadingTools] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [addForm, setAddForm] = useState<McpServerSpec | null>(null);

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

  const saveServer = async (spec: McpServerSpec) => {
    try {
      await invoke("save_mcp_server", { spec });
      await loadServers();
    } catch (e) {
      setErrors((prev) => ({ ...prev, [spec.name]: String(e) }));
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
    if (tools[name]) return; // 이미 로드됨
    setLoadingTools(name);
    setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
    try {
      const result = await invoke<{ tools: McpTool[] }>("mcp_list_tools", { serverName: name });
      setTools((prev) => ({ ...prev, [name]: result.tools ?? [] }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [name]: String(e).slice(0, 300) }));
    } finally {
      setLoadingTools(null);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[640px] max-h-[85vh] bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <PlugZap size={14} className="text-accent" />
            <span className="text-[13px] font-semibold text-white/90">MCP 서버</span>
            <span className="text-[10px] text-white/30">· Model Context Protocol</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadServers}
              className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/5"
              title="새로고침"
            >
              <RefreshCw size={12} className={loadingList ? "animate-spin" : ""} />
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {servers.length === 0 && !loadingList && (
            <div className="p-4 bg-white/3 border border-white/5 rounded-lg text-center space-y-2">
              <p className="text-[12px] text-white/60">등록된 MCP 서버가 없습니다.</p>
              <button
                onClick={installPresets}
                disabled={installing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-accent text-[11px] transition-colors disabled:opacity-50"
              >
                {installing ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                공식 프리셋 설치 (filesystem · playwright · git)
              </button>
            </div>
          )}

          {servers.map((s) => {
            const isExpanded = expanded === s.name;
            const err = errors[s.name];
            const serverTools = tools[s.name];
            return (
              <div key={s.name} className="rounded-lg border border-white/8 bg-white/[0.02] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => expandAndLoadTools(s.name)}
                    className="flex items-center gap-1 flex-1 text-left text-[12px]"
                  >
                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <Plug size={11} className={s.enabled ? "text-accent" : "text-white/30"} />
                    <span className={s.enabled ? "text-white/90 font-medium" : "text-white/50"}>
                      {s.name}
                    </span>
                    {s.description && (
                      <span className="text-[10px] text-white/30 ml-1 truncate">· {s.description}</span>
                    )}
                  </button>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={() => toggleEnabled(s)}
                      className="w-3.5 h-3.5 accent-accent cursor-pointer"
                    />
                    <span className="text-[10px] text-white/40">{s.enabled ? "활성" : "꺼짐"}</span>
                  </label>
                  <button
                    onClick={() => removeServer(s.name)}
                    className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10"
                    title="제거"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/5 p-3 space-y-2 bg-black/10">
                    <div className="font-mono text-[10px] text-white/40 break-all">
                      <span className="text-white/30">$ </span>
                      {s.command} {s.args.join(" ")}
                    </div>

                    {loadingTools === s.name && (
                      <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                        <Loader2 size={11} className="animate-spin" /> 툴 목록 조회 중…
                      </div>
                    )}

                    {err && (
                      <div className="flex items-start gap-1.5 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-300">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                        <div className="font-mono whitespace-pre-wrap break-all">{err}</div>
                      </div>
                    )}

                    {serverTools && serverTools.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-white/40 uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 size={10} className="text-green-400" /> {serverTools.length}개 툴
                        </div>
                        {serverTools.map((t) => (
                          <div key={t.name} className="px-2 py-1.5 bg-white/3 rounded text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <Play size={9} className="text-accent/60" />
                              <span className="font-mono text-accent/90">{t.name}</span>
                            </div>
                            {t.description && (
                              <div className="text-[10px] text-white/40 mt-0.5 ml-4">
                                {t.description}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {serverTools && serverTools.length === 0 && !err && (
                      <div className="text-[11px] text-white/30 italic">툴 없음</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* 서버 추가 */}
          {addForm ? (
            <div className="p-3 rounded-lg border border-accent/30 bg-accent/5 space-y-2">
              <div className="text-[12px] font-medium text-accent">새 서버 추가</div>
              <input
                placeholder="서버 이름 (고유)"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] font-mono"
              />
              <input
                placeholder="command (예: npx)"
                value={addForm.command}
                onChange={(e) => setAddForm({ ...addForm, command: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] font-mono"
              />
              <input
                placeholder="args (공백 구분)"
                value={addForm.args.join(" ")}
                onChange={(e) => setAddForm({ ...addForm, args: e.target.value.split(/\s+/).filter(Boolean) })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] font-mono"
              />
              <input
                placeholder="설명 (선택)"
                value={addForm.description ?? ""}
                onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px]"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAddForm(null)}
                  className="px-3 py-1 rounded text-[11px] text-white/50 hover:text-white/80"
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
                  className="px-3 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent text-[11px] disabled:opacity-40"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddForm({ name: "", command: "", args: [], env: {}, enabled: true })}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 text-[11px] transition-colors"
            >
              <Plus size={12} />
              서버 수동 추가
            </button>
          )}

          <p className="text-[10px] text-white/25 leading-relaxed pt-2">
            MCP = Model Context Protocol. 활성화된 서버의 툴은 AI가 스크린샷/파일/Git 등을 호출할 수 있게 해줍니다.
            <br />
            <b>Phase 74</b>: 서버 등록 + 툴 조회만 동작. AI 자동 호출은 이후 Phase에서 통합 예정.
          </p>
        </div>
      </div>
    </div>
  );
};

export default McpPanel;
