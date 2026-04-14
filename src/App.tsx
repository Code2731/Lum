import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Copy, RotateCcw, Zap, Minus, Square, X, Trash2, Settings, Plus, Search, Columns, Rows, CheckCircle2, Play, FilePlus, Download, HardDrive, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import Ansi from "ansi-to-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import CommandInput from "./components/CommandInput";

interface Action {
  type: "run" | "create";
  cmd?: string;
  path?: string;
  content?: string;
  label: string;
  status?: "pending" | "running" | "completed" | "error";
}

interface TerminalBlock {
  id: string;
  command: string;
  output: string;
  explanation?: string;
  actions?: Action[];
  analysis?: string;
  suggestion?: string;
  type: "shell" | "ai" | "error-analysis";
  status: "executing" | "completed" | "error";
  cwd: string;
  gitBranch: string | null;
}

interface AppConfig {
  theme: string;
  font_size: number;
  opacity: number;
  accent_color: string;
}

interface Pane {
  id: string;
  blocks: TerminalBlock[];
}

interface Tab {
  id: string;
  name: string;
  panes: Pane[];
  activePaneId: string;
  orientation: "horizontal" | "vertical";
}

interface PullProgress {
  status: string;
  total?: number;
  completed?: number;
}

const POPULAR_MODELS = [
  { name: "llama3", desc: "Meta의 최신 모델 (8B)", size: "4.7GB" },
  { name: "mistral", desc: "가장 인기 있는 범용 모델", size: "4.1GB" },
  { name: "gemma:7b", desc: "Google의 경량 모델", size: "5.0GB" },
  { name: "phi3", desc: "Microsoft의 초경량 모델", size: "2.3GB" },
  { name: "codellama", desc: "코딩 특화 모델", size: "3.8GB" },
];

const App = () => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "models">("general");
  
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  
  const [context, setContext] = useState<{ cwd: string; git_branch: string | null; files: string[]; project_summary: string }>({
    cwd: "~", git_branch: null, files: [], project_summary: "",
  });
  const [config, setConfig] = useState<AppConfig>({
    theme: "dark", font_size: 14, opacity: 0.95, accent_color: "#a78bfa"
  });

  const virtuosoRefs = useRef<Record<string, VirtuosoHandle | null>>({});
  const appWindow = getCurrentWindow();

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || null, [tabs, activeTabId]);
  const activePane = useMemo(() => activeTab?.panes.find(p => p.id === activeTab?.activePaneId) || null, [activeTab]);

  const applyTheme = (cfg: AppConfig) => {
    const root = document.documentElement;
    root.style.setProperty("--font-size", `${cfg.font_size}px`);
    root.style.setProperty("--opacity", `${cfg.opacity}`);
    root.style.setProperty("--accent", cfg.accent_color);
  };

  const createPane = useCallback(async (tabId: string) => {
    const id = `pane-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newPane: Pane = { id, blocks: [] };
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, panes: [...t.panes, newPane], activePaneId: id } : t));
    await invoke("spawn_pty", { tabId: id });
    return id;
  }, []);

  const createTab = useCallback(async (name: string = "Terminal") => {
    const id = `tab-${Date.now()}`;
    const newTab: Tab = { id, name, panes: [], activePaneId: "", orientation: "horizontal" };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    await createPane(id);
  }, [createPane]);

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (activeTabId === id && filtered.length > 0) setActiveTabId(filtered[filtered.length - 1].id);
      return filtered;
    });
  }, [activeTabId]);

  const splitPane = useCallback(async (orientation: "horizontal" | "vertical") => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, orientation } : t));
    await createPane(activeTabId);
  }, [activeTabId, createPane]);

  // 초기화
  useEffect(() => {
    const init = async () => {
      try {
        const [savedBlocks, savedConfig] = await Promise.all([
          invoke<TerminalBlock[]>("load_session"),
          invoke<AppConfig>("load_config")
        ]);
        setConfig(savedConfig);
        applyTheme(savedConfig);
        const ctx = await invoke<{ cwd: string; git_branch: string | null; files: string[]; project_summary: string }>("get_system_context");
        setContext(ctx);
        if (savedBlocks && savedBlocks.length > 0) {
          const tid = `tab-restored`, pid = `pane-restored`;
          const restored = savedBlocks.map((b) => (b.status === "executing" ? { ...b, status: "completed" as const } : b));
          setTabs([{ id: tid, name: "Restored", panes: [{ id: pid, blocks: restored }], activePaneId: pid, orientation: "horizontal" }]);
          setActiveTabId(tid);
          await invoke("spawn_pty", { tabId: pid });
        } else createTab("Terminal 1");
      } catch { createTab("Terminal 1"); }
    };
    init();
  }, []);

  // Ollama 상태 및 모델 동기화
  const syncOllama = useCallback(async () => {
    try {
      const online = await invoke<boolean>("check_ollama_status");
      setOllamaOnline(online);
      if (online) {
        const list = await invoke<string[]>("list_models");
        setModels(list);
        setSelectedModel((prev) => (prev && list.includes(prev) ? prev : list[0] || ""));
      }
    } catch {}
  }, []);

  useEffect(() => {
    syncOllama();
    const iv = setInterval(syncOllama, 10000);
    return () => clearInterval(iv);
  }, [syncOllama]);

  // 이벤트 리스너 (PTY 데이터 + 모델 다운로드 진행률)
  useEffect(() => {
    const unlistenPty = listen<{ tab_id: string; data: string }>("pty-data", (event) => {
      const { tab_id, data } = event.payload;
      setTabs((prev) => prev.map((t) => ({
        ...t,
        panes: t.panes.map((p) => p.id === tab_id ? {
          ...p,
          blocks: p.blocks.map((b, i, arr) => i === arr.length - 1 && b.status === "executing" ? { ...b, output: b.output + data } : b),
        } : p),
      })));
    });

    const unlistenPull = listen<PullProgress>("pull-progress", (event) => {
      setPullProgress(event.payload);
      if (event.payload.status === "success") {
        syncOllama();
        setPullProgress(null);
      }
    });

    return () => { 
      unlistenPty.then(f => f()); 
      unlistenPull.then(f => f());
    };
  }, [syncOllama]);

  const updateConfig = async (newCfg: Partial<AppConfig>) => {
    const updated = { ...config, ...newCfg };
    setConfig(updated);
    applyTheme(updated);
    await invoke("save_config", { config: updated });
  };

  const handleCommand = useCallback(async (cmd: string, type: "shell" | "ai") => {
    if (!activeTab || !activeTab.activePaneId) return;
    const paneId = activeTab.activePaneId;
    const id = Date.now().toString();
    const newBlock: TerminalBlock = {
      id, command: cmd, output: "", type, status: "executing",
      cwd: context.cwd, gitBranch: context.git_branch,
    };
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, panes: t.panes.map(p => p.id === paneId ? { ...p, blocks: [...p.blocks, newBlock] } : p) } : t));

    try {
      if (type === "ai") {
        const result = await invoke<string>("generate_ai_command", { prompt: cmd, model: selectedModel, context: `Project Context:\n${context.project_summary}\n\nCurrent CWD: ${context.cwd}` });
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        setTabs(prev => prev.map(t => t.id === activeTab.id ? {
          ...t,
          panes: t.panes.map(p => p.id === paneId ? {
            ...p,
            blocks: p.blocks.map(b => b.id === id ? {
              ...b, command: parsed?.command || b.command, explanation: parsed?.explanation || "", actions: parsed?.actions || [], output: parsed ? `$ ${parsed.command}` : result, status: "completed" as const,
            } : b)
          } : p)
        } : t));
      } else await invoke("write_to_pty", { tabId: paneId, data: cmd + "\n" });
    } catch (e) {
      setTabs(prev => prev.map(t => t.id === activeTab.id ? {
        ...t,
        panes: t.panes.map(p => p.id === paneId ? { ...p, blocks: p.blocks.map(b => b.id === id ? { ...b, output: `Error: ${e}`, status: "error" as const } : b) } : p)
      } : t));
    }
  }, [activeTab, context, selectedModel]);

  const handlePullModel = async (name: string) => {
    try {
      await invoke("pull_model", { name });
    } catch (e) {
      alert(`Download failed: ${e}`);
      setPullProgress(null);
    }
  };

  const handleDeleteModel = async (name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await invoke("delete_model", { name });
      syncOllama();
    } catch (e) {
      alert(`Delete failed: ${e}`);
    }
  };

  const handleRunAction = async (blockId: string, actionIdx: number) => {
    if (!activeTab || !activeTab.activePaneId) return;
    const paneId = activeTab.activePaneId;
    const action = tabs.find(t => t.id === activeTab.id)?.panes.find(p => p.id === paneId)?.blocks.find(b => b.id === blockId)?.actions?.[actionIdx];
    if (!action) return;
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, panes: t.panes.map(p => p.id === paneId ? { ...p, blocks: p.blocks.map(b => b.id === blockId ? { ...b, actions: b.actions?.map((a, i) => i === actionIdx ? { ...a, status: "running" as const } : a) } : b) } : p) } : t));
    try {
      if (action.type === "run" && action.cmd) await invoke("write_to_pty", { tabId: paneId, data: action.cmd + "\n" });
      else if (action.type === "create" && action.path && action.content) await invoke("create_file", { path: action.path, content: action.content });
      setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, panes: t.panes.map(p => p.id === paneId ? { ...p, blocks: p.blocks.map(b => b.id === blockId ? { ...b, actions: b.actions?.map((a, i) => i === actionIdx ? { ...a, status: "completed" as const } : a) } : b) } : p) } : t));
    } catch {
      setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, panes: t.panes.map(p => p.id === paneId ? { ...p, blocks: p.blocks.map(b => b.id === blockId ? { ...b, actions: b.actions?.map((a, i) => i === actionIdx ? { ...a, status: "error" as const } : a) } : b) } : p) } : t));
    }
  };

  const shortPath = (p: string) => p.replace(/\\/g, "/").split("/").pop() || "~";

  return (
    <div className="app-root">
      <header className="titlebar" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("button, select, input")) appWindow.startDragging(); }}>
        <div className="titlebar-left"><span className="titlebar-label">LUM</span><div className={`status-dot ${ollamaOnline ? "online" : "offline"}`} /></div>
        <div className="titlebar-center"><div className="search-bar"><Search size={12} className="search-icon" /><input type="text" placeholder="검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div></div>
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={() => splitPane("vertical")}><Columns size={14} /></button>
          <button className="titlebar-btn" onClick={() => splitPane("horizontal")}><Rows size={14} /></button>
          <button className="titlebar-btn" onClick={() => setIsSettingsOpen(true)}><Settings size={14} /></button>
          <button className="titlebar-btn" onClick={() => { setTabs(prev => prev.map(t => t.id === activeTabId ? {...t, panes: t.panes.map(p => p.id === t.activePaneId ? {...p, blocks: []} : p)} : t)); }}><Trash2 size={14} /></button>
          <button className="titlebar-btn" onClick={() => appWindow.minimize()}><Minus size={14} /></button>
          <button className="titlebar-btn" onClick={() => appWindow.toggleMaximize()}><Square size={11} /></button>
          <button className="titlebar-btn titlebar-btn-close" onClick={() => appWindow.close()}><X size={14} /></button>
        </div>
      </header>

      <nav className="tab-bar">
        {tabs.map(tab => (
          <div key={tab.id} className={`tab-item ${activeTabId === tab.id ? "active" : ""}`} onClick={() => setActiveTabId(tab.id)}>
            <span className="tab-name">{tab.name}</span>
            <button className="tab-close" onClick={(e) => closeTab(tab.id, e)}><X size={10} /></button>
          </div>
        ))}
        <button className="add-tab-btn" onClick={() => createTab(`Terminal ${tabs.length + 1}`)}><Plus size={14} /></button>
      </nav>

      <main className="block-stream-container">
        {activeTab && (
          <PanelGroup direction={activeTab.orientation}>
            {activeTab.panes.map((pane, i) => (
              <>
                <Panel key={pane.id} className={`pane-panel ${activeTab.activePaneId === pane.id ? "active" : ""}`} onClick={() => setTabs(prev => prev.map(t => t.id === activeTabId ? {...t, activePaneId: pane.id} : t))}>
                  <div className="pane-content">
                    <Virtuoso
                      ref={(el) => { virtuosoRefs.current[pane.id] = el; }}
                      data={pane.blocks.filter(b => !searchQuery || b.command.toLowerCase().includes(searchQuery.toLowerCase()) || b.output.toLowerCase().includes(searchQuery.toLowerCase()))}
                      initialTopMostItemIndex={pane.blocks.length - 1}
                      itemContent={(index, block) => (
                        <div key={block.id} className="block">
                          <div className="block-header">
                            <span className="prompt-arrow">➜</span>
                            <span className="prompt-path">{shortPath(block.cwd)}</span>
                            <span className="prompt-cmd">{block.command}</span>
                            {block.status === "executing" && <span className="status-executing">●</span>}
                          </div>
                          {block.explanation && (
                            <div className="block-explanation">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                code({ inline, className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || "");
                                  const codeText = String(children).replace(/\n$/, "");
                                  return !inline ? (
                                    <div className="md-code-block">
                                      <div className="md-code-header">
                                        <span className="md-code-lang">{match ? match[1] : "bash"}</span>
                                        <div className="md-code-actions">
                                          <button onClick={() => navigator.clipboard.writeText(codeText)}><Copy size={12} /></button>
                                          <button onClick={() => handleCommand(codeText, "shell")}><Zap size={12} /></button>
                                        </div>
                                      </div>
                                      <code className={className} {...props}>{children}</code>
                                    </div>
                                  ) : (<code className={className} {...props}>{children}</code>);
                                }
                              }}>{block.explanation}</ReactMarkdown>
                            </div>
                          )}
                          {block.actions && block.actions.length > 0 && (
                            <div className="workflow-actions">
                              {block.actions.map((action, idx) => (
                                <div key={idx} className="workflow-step">
                                  <div className={`workflow-step-icon ${action.status || "pending"}`}>{action.status === "completed" ? <CheckCircle2 size={14} /> : action.type === "run" ? <Play size={12} /> : <FilePlus size={12} />}</div>
                                  <div className="workflow-step-label">{action.label}</div>
                                  <button className={`workflow-step-btn ${action.status === "completed" ? "completed" : ""}`} onClick={() => handleRunAction(block.id, idx)} disabled={action.status === "running" || action.status === "completed"}>{action.status === "running" ? "Running..." : action.status === "completed" ? "Done" : "Execute"}</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {(block.output || block.status === "executing") && <div className="block-output"><Ansi>{block.output}</Ansi></div>}
                        </div>
                      )}
                    />
                  </div>
                </Panel>
                {i < activeTab.panes.length - 1 && <PanelResizeHandle className="pane-resize-handle" />}
              </>
            ))}
          </PanelGroup>
        )}
      </main>

      <CommandInput onCommandSubmit={handleCommand} selectedModel={selectedModel} ollamaOnline={ollamaOnline} context={context} />

      {isSettingsOpen && (
        <div className="settings-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-header">
              <div className="settings-tabs">
                <button className={`settings-tab ${settingsTab === "general" ? "active" : ""}`} onClick={() => setSettingsTab("general")}>General</button>
                <button className={`settings-tab ${settingsTab === "models" ? "active" : ""}`} onClick={() => setSettingsTab("models")}>Models</button>
              </div>
              <button onClick={() => setIsSettingsOpen(false)}><X size={18} /></button>
            </div>
            <div className="settings-body">
              {settingsTab === "general" ? (
                <div className="settings-view">
                  <div className="setting-item"><label>Font Size ({config.font_size}px)</label><input type="range" min="10" max="24" value={config.font_size} onChange={e => updateConfig({ font_size: parseInt(e.target.value) })} /></div>
                  <div className="setting-item"><label>Opacity ({Math.round(config.opacity * 100)}%)</label><input type="range" min="0.5" max="1" step="0.05" value={config.opacity} onChange={e => updateConfig({ opacity: parseFloat(e.target.value) })} /></div>
                  <div className="setting-item"><label>Accent Color</label><div className="color-presets">{["#00d4aa", "#a78bfa", "#58a6ff", "#f85149", "#d29922"].map(color => (
                    <div key={color} className={`color-swatch ${config.accent_color === color ? "active" : ""}`} style={{ background: color }} onClick={() => updateConfig({ accent_color: color })} />
                  ))}</div></div>
                </div>
              ) : (
                <div className="settings-view models-manager">
                  {pullProgress && (
                    <div className="pull-progress-card">
                      <div className="pull-status">{pullProgress.status}...</div>
                      {pullProgress.total && pullProgress.completed && (
                        <div className="progress-bar-bg">
                          <div className="progress-bar-fill" style={{ width: `${(pullProgress.completed / pullProgress.total) * 100}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="model-section">
                    <h4>Installed Models</h4>
                    <div className="model-list">
                      {models.map(m => (
                        <div key={m} className="model-item">
                          <HardDrive size={14} className="model-icon" />
                          <span className="model-name">{m}</span>
                          <button className="model-delete-btn" onClick={() => handleDeleteModel(m)}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="model-section">
                    <h4>Available to Download</h4>
                    <div className="model-list">
                      {POPULAR_MODELS.map(pm => (
                        <div key={pm.name} className="model-item available">
                          <div className="model-info">
                            <span className="model-name">{pm.name} <small>({pm.size})</small></span>
                            <span className="model-desc">{pm.desc}</span>
                          </div>
                          {models.includes(pm.name) || (models.some(m => m.startsWith(pm.name))) ? (
                            <span className="model-badge">Installed</span>
                          ) : (
                            <button className="model-download-btn" onClick={() => handlePullModel(pm.name)} disabled={!!pullProgress}>
                              <Download size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
