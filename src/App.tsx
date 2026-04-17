import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Copy,
  Zap,
  Minus,
  Square,
  X,
  Trash2,
  Settings,
  Plus,
  Search,
  Columns,
  Rows,
  CheckCircle2,
  Play,
  FilePlus,
  Download,
  HardDrive,
  Loader2,
  History,
  File,
  Layers,
  BrainCircuit,
  Monitor,
  Globe,
  RefreshCcw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import Ansi from "ansi-to-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import Fuse from "fuse.js";
import CommandInput from "./components/CommandInput";

interface Action {
  type: "run" | "create";
  cmd?: string;
  path?: string;
  content?: string;
  label: string;
  status?: "pending" | "running" | "completed" | "error";
}

interface ReasoningStep {
  agent: "Planner" | "Coder" | "Reviewer";
  content: string;
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
  embedding?: number[];
  reasoningSteps?: ReasoningStep[];
}

interface AppConfig {
  theme: string;
  font_size: number;
  opacity: number;
  accent_color: string;
  gemini_api_key?: string;
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

interface IndexProgress {
  current: number;
  total: number;
}

interface CodeChunk {
  path: string;
  content: string;
}

interface PaletteItem {
  id: string;
  type: "file" | "command" | "tab" | "action";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

const POPULAR_MODELS = [
  { name: "llama3", desc: "Meta의 최신 모델 (8B)", size: "4.7GB" },
  { name: "mistral", desc: "가장 인기 있는 범용 모델", size: "4.1GB" },
  { name: "webgpu-phi3-mini", desc: "Local WebGPU (Microsoft)", size: "Local" },
  { name: "gemini-1.5-flash", desc: "Google Flash (Free Tier)", size: "Cloud" },
  { name: "gemini-1.5-pro", desc: "Google Pro (Paid Tier)", size: "Cloud" },
  { name: "codellama", desc: "코딩 특화 모델", size: "3.8GB" },
];

const App = () => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "models">(
    "general",
  );
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteResults, setPaletteResults] = useState<PaletteItem[]>([]);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [wgpuSupported, setWgpuSupported] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(
    null,
  );
  const [isIndexing, setIsIndexing] = useState(false);

  const [showWebview, setShowWebview] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState("http://localhost:1420");
  const [webviewInput, setWebviewUrlInput] = useState("http://localhost:1420");

  const [context, setContext] = useState<{
    cwd: string;
    git_branch: string | null;
    files: string[];
    project_summary: string;
  }>({
    cwd: "~",
    git_branch: null,
    files: [],
    project_summary: "",
  });
  const [config, setConfig] = useState<AppConfig>({
    theme: "dark",
    font_size: 14,
    opacity: 0.95,
    accent_color: "#a78bfa",
  });

  const virtuosoRefs = useRef<Record<string, VirtuosoHandle | null>>({});
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const appWindow = getCurrentWindow();

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || null,
    [tabs, activeTabId],
  );
  const activePane = useMemo(
    () =>
      activeTab?.panes.find((p) => p.id === activeTab?.activePaneId) || null,
    [activeTab],
  );

  const applyTheme = useCallback((cfg: AppConfig) => {
    const root = document.documentElement;
    root.style.setProperty("--font-size", `${cfg.font_size}px`);
    root.style.setProperty("--opacity", `${cfg.opacity}`);
    root.style.setProperty("--accent", cfg.accent_color);
  }, []);

  const createPane = useCallback(async (tabId: string, initialCwd?: string) => {
    const id = `pane-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newPane: Pane = { id, blocks: [] };
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, panes: [...t.panes, newPane], activePaneId: id }
          : t,
      ),
    );
    try {
      await invoke("spawn_pty", { tabId: id, cwd: initialCwd });
    } catch (e) {
      console.error("spawn pty error", e);
    }
    return id;
  }, []);

  const createTab = useCallback(
    async (name: string = "Terminal", initialCwd?: string) => {
      const id = `tab-${Date.now()}`;
      const newTab: Tab = {
        id,
        name,
        panes: [],
        activePaneId: "",
        orientation: "horizontal",
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
      await createPane(id, initialCwd);
    },
    [createPane],
  );

  const closeTab = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (activeTabId === id && filtered.length > 0)
          setActiveTabId(filtered[filtered.length - 1].id);
        return filtered;
      });
    },
    [activeTabId],
  );

  const splitPane = useCallback(
    async (dir: "vertical" | "horizontal") => {
      if (!activeTabId) return;
      // UI상 '세로 분할'은 패널들이 가로로 배치되는 것(horizontal orientation)
      const orientation = dir === "vertical" ? "horizontal" : "vertical";
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, orientation } : t)),
      );
      await createPane(activeTabId, activePane?.blocks.slice(-1)[0]?.cwd);
    },
    [activeTabId, createPane, activePane],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      } else if (isCmd && e.key === "t") {
        e.preventDefault();
        createTab(`Terminal ${tabs.length + 1}`);
      } else if (isCmd && e.key === "w") {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      } else if (isCmd && e.key === "d") {
        e.preventDefault();
        if (e.shiftKey) splitPane("horizontal");
        else splitPane("vertical");
      } else if (isCmd && e.key === "b") {
        e.preventDefault();
        setShowWebview((prev) => !prev);
      } else if (isCmd && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (tabs[idx]) setActiveTabId(tabs[idx].id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId, createTab, closeTab, splitPane]);

  useEffect(() => {
    if (tabs.length > 0) {
      const toSave = tabs.map((t) => ({
        ...t,
        panes: t.panes.map((p) => ({
          ...p,
          blocks: p.blocks
            .slice(-50)
            .map((b) => ({
              ...b,
              status: b.status === "executing" ? "completed" : b.status,
            })),
        })),
      }));
      invoke("save_session", { tabs: toSave }).catch(console.error);
    }
  }, [tabs]);

  useEffect(() => {
    const init = async () => {
      try {
        const [savedTabs, savedConfig] = await Promise.all([
          invoke<Tab[]>("load_session"),
          invoke<AppConfig>("load_config"),
        ]);
        if (savedConfig) {
          setConfig(savedConfig);
          applyTheme(savedConfig);
        }
        const ctx = await invoke<{
          cwd: string;
          git_branch: string | null;
          files: string[];
          project_summary: string;
        }>("get_system_context");
        setContext(ctx);
        if (savedTabs && savedTabs.length > 0) {
          setTabs(savedTabs);
          setActiveTabId(savedTabs[0].id);
          for (const tab of savedTabs) {
            for (const pane of tab.panes) {
              await invoke("spawn_pty", {
                tabId: pane.id,
                cwd: pane.blocks.slice(-1)[0]?.cwd,
              }).catch(() => {});
            }
          }
        } else createTab("Terminal 1");
      } catch (e) {
        createTab("Terminal 1");
      }
    };
    init();
  }, [applyTheme, createTab]);

  const syncOllama = useCallback(async () => {
    try {
      const online = await invoke<boolean>("check_ollama_status");
      setOllamaOnline(online);
      if (online) {
        const list = await invoke<string[]>("list_models");
        setModels(list);
        setSelectedModel((prev) =>
          prev && list.includes(prev) ? prev : list[0] || "",
        );
      }
      const wgpu = await invoke<boolean>("check_wgpu_support").catch(() => false);
      setWgpuSupported(wgpu);
    } catch {}
  }, []);

  useEffect(() => {
    syncOllama();
    const iv = setInterval(syncOllama, 10000);
    return () => clearInterval(iv);
  }, [syncOllama]);

  useEffect(() => {
    const unlistenPty = listen<{ tab_id: string; data: string }>(
      "pty-data",
      (event) => {
        const { tab_id, data } = event.payload;
        setTabs((prev) =>
          prev.map((t) => ({
            ...t,
            panes: t.panes.map((p) =>
              p.id === tab_id
                ? {
                    ...p,
                    blocks: p.blocks.map((b, i, arr) =>
                      i === arr.length - 1 && b.status === "executing"
                        ? { ...b, output: b.output + data }
                        : b,
                    ),
                  }
                : p,
            ),
          })),
        );
      },
    );
    const unlistenPull = listen<PullProgress>("pull-progress", (event) => {
      setPullProgress(event.payload);
      if (event.payload.status === "success") {
        syncOllama();
        setPullProgress(null);
      }
    });
    const unlistenIndex = listen<IndexProgress>("index-progress", (event) => {
      setIndexProgress(event.payload);
    });
    return () => {
      unlistenPty.then((f) => f());
      unlistenPull.then((f) => f());
      unlistenIndex.then((f) => f());
    };
  }, [syncOllama]);

  useEffect(() => {
    if (!selectedModel || !ollamaOnline) return;
    const timeoutId = setTimeout(() => {
      tabs.forEach((tab) => {
        tab.panes.forEach((pane) => {
          pane.blocks.forEach((block) => {
            if (
              block.status === "completed" &&
              !block.embedding &&
              !block.command.startsWith("/") &&
              block.type === "shell"
            ) {
              const textToEmbed = `${block.command}\n${block.output.slice(0, 500)}`;
              invoke<number[]>("generate_embedding", {
                prompt: textToEmbed,
                model: selectedModel,
              })
                .then((emb) => {
                  setTabs((prev) =>
                    prev.map((t) =>
                      t.id === tab.id
                        ? {
                            ...t,
                            panes: t.panes.map((p) =>
                              p.id === pane.id
                                ? {
                                    ...p,
                                    blocks: p.blocks.map((b) =>
                                      b.id === block.id
                                        ? { ...b, embedding: emb }
                                        : b,
                                    ),
                                  }
                                : p,
                            ),
                          }
                        : t,
                    ),
                  );
                })
                .catch(() => {});
            }
          });
        });
      });
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [tabs, selectedModel, ollamaOnline]);

  const handleIndexProject = async () => {
    if (!selectedModel) return;
    setIsIndexing(true);
    try {
      await invoke("index_project", { model: selectedModel });
      alert("Codebase Indexing Complete!");
    } catch (e) {
      alert(`Indexing failed: ${e}`);
    } finally {
      setIsIndexing(false);
      setIndexProgress(null);
    }
  };

  const handleCommand = useCallback(
    async (cmd: string, type: "shell" | "ai") => {
      if (!activeTab || !activeTab.activePaneId) return;
      const paneId = activeTab.activePaneId;
      const id = Date.now().toString();
      const newBlock: TerminalBlock = {
        id,
        command: cmd,
        output: "",
        type,
        status: "executing",
        cwd: context.cwd,
        gitBranch: context.git_branch,
        reasoningSteps: [],
      };
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                panes: t.panes.map((p) =>
                  p.id === paneId ? { ...p, blocks: [...p.blocks, newBlock] } : p,
                ),
              }
            : t,
        ),
      );

      try {
        if (type === "ai") {
          // 1. 코드베이스 검색 (RAG)
          const searchResults = await invoke<CodeChunk[]>("search_codebase", {
            query: cmd,
            model: selectedModel,
          }).catch(() => []);
          const codebaseContext = searchResults
            .map((r) => `File: ${r.path}\nContent:\n${r.content}`)
            .join("\n---\n");
          
          const baseContext = `Project Summary:\n${context.project_summary}\n\nRelevant Code:\n${codebaseContext}\n\nCWD: ${context.cwd}`;

          // --- AGENT SWARM START ---
          
          // [Step 1: Planner]
          const planPrompt = `${baseContext}\n\nUser Request: ${cmd}\n\nAs a 'Planner' agent, create a step-by-step plan to fulfill this request. Respond with a concise plan.`;
          const planRes = await invoke<string>("generate_ai_command", {
            prompt: planPrompt,
            model: selectedModel,
            context: "PLANNING_MODE",
          });
          
          setTabs(prev => prev.map(t => t.id === activeTab.id ? {
            ...t, panes: t.panes.map(p => p.id === paneId ? {
              ...p, blocks: p.blocks.map(b => b.id === id ? {
                ...b, reasoningSteps: [...(b.reasoningSteps || []), { agent: "Planner", content: planRes }]
              } : b)
            } : p)
          } : t));

          // [Step 2: Coder]
          const coderPrompt = `${baseContext}\n\nPlan: ${planRes}\n\nAs a 'Coder' agent, implement the plan. Respond ONLY with a JSON object containing 'command', 'explanation', and 'actions' as specified before.`;
          const coderRes = await invoke<string>("generate_ai_command", {
            prompt: coderPrompt,
            model: selectedModel,
            context: "CODING_MODE",
          });

          setTabs(prev => prev.map(t => t.id === activeTab.id ? {
            ...t, panes: t.panes.map(p => p.id === paneId ? {
              ...p, blocks: p.blocks.map(b => b.id === id ? {
                ...b, reasoningSteps: [...(b.reasoningSteps || []), { agent: "Coder", content: "Code implementation generated." }]
              } : b)
            } : p)
          } : t));

          // [Step 3: Reviewer]
          const reviewerPrompt = `Review this implementation:\n${coderRes}\n\nContext: ${baseContext}\n\nAs a 'Reviewer' agent, check for bugs or improvements. Respond with a short review message.`;
          const reviewerRes = await invoke<string>("generate_ai_command", {
            prompt: reviewerPrompt,
            model: selectedModel,
            context: "REVIEW_MODE",
          });

          setTabs(prev => prev.map(t => t.id === activeTab.id ? {
            ...t, panes: t.panes.map(p => p.id === paneId ? {
              ...p, blocks: p.blocks.map(b => b.id === id ? {
                ...b, reasoningSteps: [...(b.reasoningSteps || []), { agent: "Reviewer", content: reviewerRes }]
              } : b)
            } : p)
          } : t));

          // [Step 4: Tester]
          const testerPrompt = `Based on the plan and implementation:\nPlan: ${planRes}\nCode: ${coderRes}\n\nAs a 'Tester' agent, identify potential edge cases and suggest a testing strategy or a command to verify the fix. Respond with a concise test plan.`;
          const testerRes = await invoke<string>("generate_ai_command", {
            prompt: testerPrompt,
            model: selectedModel,
            context: "TESTING_MODE",
          });

          setTabs(prev => prev.map(t => t.id === activeTab.id ? {
            ...t, panes: t.panes.map(p => p.id === paneId ? {
              ...p, blocks: p.blocks.map(b => b.id === id ? {
                ...b, reasoningSteps: [...(b.reasoningSteps || []), { agent: "Tester", content: testerRes }]
              } : b)
            } : p)
          } : t));

          // --- FINAL RENDER ---
          const jsonMatch = coderRes.match(/\{[\s\S]*\}/);
          const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
          
          setTabs((prev) =>
            prev.map((t) =>
              t.id === activeTab.id
                ? {
                    ...t,
                    panes: t.panes.map((p) =>
                      p.id === paneId
                        ? {
                            ...p,
                            blocks: p.blocks.map((b) =>
                              b.id === id
                                ? {
                                    ...b,
                                    command: parsed?.command || b.command,
                                    explanation: parsed?.explanation || "",
                                    actions: parsed?.actions || [],
                                    output: parsed ? `$ ${parsed.command}` : coderRes,
                                    status: "completed" as const,
                                  }
                                : b,
                            ),
                          }
                        : p,
                    ),
                  }
                : t,
            ),
          );
        } else await invoke("write_to_pty", { tabId: paneId, data: cmd + "\n" });
      } catch (e) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id
              ? {
                  ...t,
                  panes: t.panes.map((p) =>
                    p.id === paneId
                      ? {
                          ...p,
                          blocks: p.blocks.map((b) =>
                            b.id === id
                              ? {
                                  ...b,
                                  output: `Error: ${e}`,
                                  status: "error" as const,
                                }
                              : b,
                          ),
                        }
                      : p,
                  ),
                }
              : t,
          ),
        );
      }
    },
    [activeTab, context, selectedModel, showWebview, webviewUrl],
  );

  const handleRunAction = async (blockId: string, actionIdx: number) => {
    if (!activeTab || !activeTab.activePaneId) return;
    const paneId = activeTab.activePaneId;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id
          ? {
              ...t,
              panes: t.panes.map((p) =>
                p.id === paneId
                  ? {
                      ...p,
                      blocks: p.blocks.map((b) =>
                        b.id === blockId
                          ? {
                              ...b,
                              actions: b.actions?.map((a, i) =>
                                i === actionIdx
                                  ? { ...a, status: "running" as const }
                                  : a,
                              ),
                            }
                          : b,
                      ),
                    }
                  : p,
              ),
            }
          : t,
      ),
    );
    try {
      const action = activePane?.blocks.find((b) => b.id === blockId)?.actions?.[
        actionIdx
      ];
      if (action?.type === "run" && action.cmd)
        await invoke("write_to_pty", { tabId: paneId, data: action.cmd + "\n" });
      else if (action?.type === "create" && action.path && action.content)
        await invoke("create_file", {
          path: action.path,
          content: action.content,
        });
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                panes: t.panes.map((p) =>
                  p.id === paneId
                    ? {
                        ...p,
                        blocks: p.blocks.map((b) =>
                          b.id === blockId
                            ? {
                                ...b,
                                actions: b.actions?.map((a, i) =>
                                  i === actionIdx
                                    ? { ...a, status: "completed" as const }
                                    : a,
                                ),
                              }
                            : b,
                        ),
                      }
                    : p,
                ),
              }
            : t,
        ),
      );
    } catch {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                panes: t.panes.map((p) =>
                  p.id === paneId
                    ? {
                        ...p,
                        blocks: p.blocks.map((b) =>
                          b.id === blockId
                            ? {
                                ...b,
                                actions: b.actions?.map((a, i) =>
                                  i === actionIdx
                                    ? { ...a, status: "error" as const }
                                    : a,
                                ),
                              }
                            : b,
                        ),
                      }
                    : p,
                ),
              }
            : t,
        ),
      );
    }
  };

  const updateConfig = async (newCfg: Partial<AppConfig>) => {
    const updated = { ...config, ...newCfg };
    setConfig(updated);
    applyTheme(updated);
    await invoke("save_config", { config: updated });
  };

  useEffect(() => {
    if (isPaletteOpen) {
      setTimeout(() => paletteInputRef.current?.focus(), 10);
      setPaletteSearch("");
    }
  }, [isPaletteOpen]);

  useEffect(() => {
    if (!isPaletteOpen) return;
    const buildItems = async () => {
      const items: PaletteItem[] = [];
      items.push({
        id: "act-new-tab",
        type: "action",
        title: "New Tab",
        subtitle: "Command + T",
        icon: <Plus size={14} />,
        onSelect: () => createTab(),
      });
      items.push({
        id: "act-split-v",
        type: "action",
        title: "Split Vertical",
        subtitle: "Command + D",
        icon: <Columns size={14} />,
        onSelect: () => splitPane("vertical"),
      });
      items.push({
        id: "act-split-h",
        type: "action",
        title: "Split Horizontal",
        subtitle: "Shift + Command + D",
        icon: <Rows size={14} />,
        onSelect: () => splitPane("horizontal"),
      });
      items.push({
        id: "act-settings",
        type: "action",
        title: "Open Settings",
        icon: <Settings size={14} />,
        onSelect: () => setIsSettingsOpen(true),
      });

      tabs.forEach((t, i) =>
        items.push({
          id: `tab-${t.id}`,
          type: "tab",
          title: `Switch to: ${t.name}`,
          subtitle: `Tab ${i + 1}`,
          icon: <Layers size={14} />,
          onSelect: () => setActiveTabId(t.id),
        }),
      );

      const history = Array.from(
        new Set(tabs.flatMap((t) => t.panes.flatMap((p) => p.blocks.map((b) => b.command)))),
      ).slice(-20);
      history.forEach((cmd, i) =>
        items.push({
          id: `hist-${i}`,
          type: "command",
          title: cmd,
          subtitle: "History",
          icon: <History size={14} />,
          onSelect: () => handleCommand(cmd, "shell"),
        }),
      );

      try {
        const files = await invoke<string[]>("get_project_files");
        files
          .slice(0, 100)
          .forEach((f) =>
            items.push({
              id: `file-${f}`,
              type: "file",
              title: f.split("/").pop() || f,
              subtitle: f,
              icon: <File size={14} />,
              onSelect: () => handleCommand(`cat ${f}`, "shell"),
            }),
          );
      } catch {}

      if (paletteSearch.startsWith("? ") && selectedModel && ollamaOnline) {
        const query = paletteSearch.slice(2).trim();
        if (query.length > 2) {
          try {
            const queryEmb = await invoke<number[]>("generate_embedding", {
              prompt: query,
              model: selectedModel,
            });
            const allBlocks = tabs.flatMap((t) =>
              t.panes.flatMap((p) => p.blocks.filter((b) => b.embedding)),
            );
            const cosineSimilarity = (a: number[], b: number[]) => {
              let dotProduct = 0,
                normA = 0,
                normB = 0;
              for (let i = 0; i < a.length; i++) {
                dotProduct += a[i] * b[i];
                normA += a[i] * a[i];
                normB += b[i] * b[i];
              }
              if (normA === 0 || normB === 0) return 0;
              return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            };
            const scored = allBlocks
              .map((b) => ({
                block: b,
                score: cosineSimilarity(queryEmb, b.embedding!),
              }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 8);
            setPaletteResults(
              scored.map((s) => ({
                id: `semantic-${s.block.id}`,
                type: "command",
                title: s.block.command,
                subtitle: `유사도: ${(s.score * 100).toFixed(1)}% | ${s.block.output.slice(0, 40).replace(/\n/g, " ")}`,
                icon: <Zap size={14} />,
                onSelect: () => handleCommand(s.block.command, "shell"),
              })),
            );
            setPaletteIdx(0);
            return;
          } catch {}
        }
      }
      if (!paletteSearch) {
        setPaletteResults(items.slice(0, 10));
        return;
      }
      const fuse = new Fuse(items, {
        keys: ["title", "subtitle"],
        threshold: 0.4,
      });
      setPaletteResults(fuse.search(paletteSearch).map((r) => r.item).slice(0, 10));
      setPaletteIdx(0);
    };
    buildItems();
  }, [
    isPaletteOpen,
    paletteSearch,
    tabs,
    createTab,
    splitPane,
    selectedModel,
    ollamaOnline,
    handleCommand,
  ]);

  const handlePaletteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPaletteIdx((prev) => (prev + 1) % (paletteResults.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPaletteIdx(
        (prev) => (prev - 1 + paletteResults.length) % (paletteResults.length || 1),
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (paletteResults[paletteIdx]) {
        paletteResults[paletteIdx].onSelect();
        setIsPaletteOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsPaletteOpen(false);
    }
  };

  const handleAutoFix = async (block: TerminalBlock) => {
    if (!activeTab || !activeTab.activePaneId) return;
    const paneId = activeTab.activePaneId;
    const id = `err-${Date.now()}`;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id
          ? {
              ...t,
              panes: t.panes.map((p) =>
                p.id === paneId
                  ? {
                      ...p,
                      blocks: [
                        ...p.blocks,
                        {
                          id,
                          command: `Auto-Fix: ${block.command}`,
                          output: "분석 중...",
                          type: "error-analysis",
                          status: "executing",
                          cwd: block.cwd,
                          gitBranch: block.gitBranch,
                        },
                      ],
                    }
                  : p,
              ),
            }
          : t,
      ),
    );
    try {
      const result = await invoke<string>("analyze_error", {
        command: block.command,
        stderr: block.output,
        model: selectedModel,
        context: `CWD: ${context.cwd}`,
      });
      const parsed = JSON.parse(result);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                panes: t.panes.map((p) =>
                  p.id === paneId
                    ? {
                        ...p,
                        blocks: p.blocks.map((b) =>
                          b.id === id
                            ? {
                                ...b,
                                analysis: parsed.analysis,
                                suggestion: parsed.suggestion,
                                status: "completed" as const,
                              }
                            : b,
                        ),
                      }
                    : p,
                ),
              }
            : t,
        ),
      );
      if (parsed.suggestion)
        setTimeout(() => handleCommand(parsed.suggestion, "shell"), 1500);
    } catch {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                panes: t.panes.map((p) =>
                  p.id === paneId
                    ? {
                        ...p,
                        blocks: p.blocks.map((b) =>
                          b.id === id
                            ? {
                                ...b,
                                output: "Auto-Fix failed.",
                                status: "error" as const,
                              }
                            : b,
                        ),
                      }
                    : p,
                ),
              }
            : t,
        ),
      );
    }
  };

  const handleAnalyzeError = useCallback(
    async (block: TerminalBlock) => {
      if (!activeTab || !activeTab.activePaneId) return;
      const paneId = activeTab.activePaneId;
      const id = `err-${Date.now()}`;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                panes: t.panes.map((p) =>
                  p.id === paneId
                    ? {
                        ...p,
                        blocks: [
                          ...p.blocks,
                          {
                            id,
                            command: `분석: ${block.command}`,
                            output: "",
                            type: "error-analysis",
                            status: "executing",
                            cwd: block.cwd,
                            gitBranch: block.gitBranch,
                          },
                        ],
                      }
                    : p,
                ),
              }
            : t,
        ),
      );
      try {
        const result = await invoke<string>("analyze_error", {
          command: block.command,
          stderr: block.output,
          model: selectedModel,
          context: `CWD: ${context.cwd}`,
        });
        const parsed = JSON.parse(result);
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id
              ? {
                  ...t,
                  panes: t.panes.map((p) =>
                    p.id === paneId
                      ? {
                          ...p,
                          blocks: p.blocks.map((b) =>
                            b.id === id
                              ? {
                                  ...b,
                                  analysis: parsed.analysis,
                                  suggestion: parsed.suggestion,
                                  status: "completed" as const,
                                }
                              : b,
                          ),
                        }
                      : p,
                  ),
                }
              : t,
          ),
        );
      } catch {}
    },
    [activeTab, selectedModel, context.cwd],
  );

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
  const shortPath = (p: string) => p.replace(/\\/g, "/").split("/").pop() || "~";

  return (
    <div className="app-root">
      {isPaletteOpen && (
        <div className="palette-overlay" onClick={() => setIsPaletteOpen(false)}>
          <div className="palette-modal" onClick={(e) => e.stopPropagation()}>
            <div className="palette-header">
              <Search size={16} className="palette-search-icon" />
              <input
                ref={paletteInputRef}
                type="text"
                placeholder="명령어, 파일, 탭 검색..."
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                onKeyDown={handlePaletteKeyDown}
              />
              <kbd>ESC</kbd>
            </div>
            <div className="palette-results">
              {paletteResults.map((item, idx) => (
                <div
                  key={item.id}
                  className={`palette-item ${idx === paletteIdx ? "active" : ""}`}
                  onClick={() => {
                    item.onSelect();
                    setIsPaletteOpen(false);
                  }}
                >
                  <div className="palette-item-icon">{item.icon}</div>
                  <div className="palette-item-info">
                    <div className="palette-item-title">{item.title}</div>
                    {item.subtitle && (
                      <small className="palette-item-subtitle">
                        {item.subtitle}
                      </small>
                    )}
                  </div>
                  {idx === paletteIdx && (
                    <div className="palette-item-hint">Enter</div>
                  )}
                </div>
              ))}
              {paletteResults.length === 0 && (
                <div className="palette-empty">결과가 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <header
        className="titlebar"
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("button, select, input"))
            appWindow.startDragging();
        }}
      >
        <div className="titlebar-left">
          <span className="titlebar-label">LUM</span>
          <div
            className={`status-dot ${ollamaOnline ? "online" : "offline"}`}
          />
        </div>
        <div className="titlebar-center">
          <div className="search-bar">
            <Search size={12} className="search-icon" />
            <input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="titlebar-controls">
          <button
            className={`titlebar-btn ${showWebview ? "active" : ""}`}
            onClick={() => setShowWebview((prev) => !prev)}
            title="Toggle Visual Browser (Cmd+B)"
          >
            <Monitor size={14} />
          </button>
          <button
            className="titlebar-btn"
            onClick={() => splitPane("vertical")}
            title="Split Vertical"
          >
            <Columns size={14} />
          </button>
          <button
            className="titlebar-btn"
            onClick={() => splitPane("horizontal")}
            title="Split Horizontal"
          >
            <Rows size={14} />
          </button>
          <button
            className="titlebar-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            <Settings size={14} />
          </button>
          <button
            className="titlebar-btn"
            onClick={() => {
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === activeTabId
                    ? {
                        ...t,
                        panes: t.panes.map((p) =>
                          p.id === t.activePaneId ? { ...p, blocks: [] } : p,
                        ),
                      }
                    : t,
                ),
              );
            }}
            title="Clear Terminal"
          >
            <Trash2 size={14} />
          </button>
          <button className="titlebar-btn" onClick={() => appWindow.minimize()}>
            <Minus size={14} />
          </button>
          <button
            className="titlebar-btn"
            onClick={() => appWindow.toggleMaximize()}
          >
            <Square size={11} />
          </button>
          <button
            className="titlebar-btn titlebar-btn-close"
            onClick={() => appWindow.close()}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <nav className="tab-bar">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            className={`tab-item ${activeTabId === tab.id ? "active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span className="tab-index">{i + 1}</span>
            <span className="tab-name">{tab.name}</span>
            <button className="tab-close" onClick={(e) => closeTab(tab.id, e)}>
              <X size={10} />
            </button>
          </div>
        ))}
        <button
          className="add-tab-btn"
          onClick={() => createTab(`Terminal ${tabs.length + 1}`)}
          title="New Tab"
        >
          <Plus size={14} />
        </button>
      </nav>

      <main className="main-layout">
        <PanelGroup id="main-group" orientation="horizontal">
          <Panel
            id="terminal-section"
            defaultSize={showWebview ? 60 : 100}
            minSize={20}
          >
            <div className="block-stream-container">
              {activeTab && activeTab.panes.length > 0 ? (
                <PanelGroup
                  id={`tab-group-${activeTab.id}`}
                  key={`${activeTab.id}-${activeTab.orientation}`}
                  orientation={activeTab.orientation}
                >
                  {activeTab.panes.flatMap((pane, i) => {
                    const elements = [
                      <Panel
                        id={pane.id}
                        key={pane.id}
                        className={`pane-panel ${
                          activeTab.activePaneId === pane.id ? "active" : ""
                        }`}
                        minSize={10}
                        onClick={() =>
                          setTabs((prev) =>
                            prev.map((t) =>
                              t.id === activeTabId
                                ? { ...t, activePaneId: pane.id }
                                : t,
                            ),
                          )
                        }
                      >
                        <div className="pane-content">
                          <Virtuoso
                            ref={(el) => {
                              virtuosoRefs.current[pane.id] = el;
                            }}
                            data={pane.blocks.filter(
                              (b) =>
                                !searchQuery ||
                                b.command
                                  .toLowerCase()
                                  .includes(searchQuery.toLowerCase()) ||
                                b.output
                                  .toLowerCase()
                                  .includes(searchQuery.toLowerCase()),
                            )}
                            initialTopMostItemIndex={pane.blocks.length - 1}
                            itemContent={(_index, block) => (
                              <div key={block.id} className="block">
                                <div className="block-header">
                                  <span className="prompt-arrow">➜</span>
                                  <span className="prompt-path">
                                    {shortPath(block.cwd)}
                                  </span>
                                  <span className="prompt-cmd">
                                    {block.command}
                                  </span>
                                  {block.status === "executing" && (
                                    <span className="status-executing">●</span>
                                  )}
                                </div>

                                {/* Reasoning Steps (Agent Swarms) */}
                                {block.reasoningSteps && block.reasoningSteps.length > 0 && (
                                  <div className="reasoning-container">
                                    {block.reasoningSteps.map((step, idx) => (
                                      <div key={idx} className="reasoning-step">
                                        <div className="reasoning-header">
                                          <BrainCircuit size={12} className={`agent-icon ${step.agent.toLowerCase()}`} />
                                          <span className="agent-name">{step.agent}</span>
                                        </div>
                                        <div className="reasoning-content">{step.content}</div>
                                      </div>
                                    ))}
                                    {block.status === "executing" && (
                                      <div className="reasoning-loader">
                                        <Loader2 size={12} className="animate-spin" />
                                        <span>AI 군집이 다음 단계를 논의 중입니다...</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {block.explanation && (
                                  <div className="block-explanation">
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        code({
                                          inline,
                                          className,
                                          children,
                                          ...props
                                        }: any) {
                                          const match = /language-(\w+)/.exec(
                                            className || "",
                                          );
                                          const codeText = String(
                                            children,
                                          ).replace(/\n$/, "");
                                          return !inline ? (
                                            <div className="md-code-block">
                                              <div className="md-code-header">
                                                <span className="md-code-lang">
                                                  {match ? match[1] : "bash"}
                                                </span>
                                                <div className="md-code-actions">
                                                  <button
                                                    onClick={() =>
                                                      navigator.clipboard.writeText(
                                                        codeText,
                                                      )
                                                    }
                                                  >
                                                    <Copy size={12} />
                                                  </button>
                                                  <button
                                                    onClick={() =>
                                                      handleCommand(
                                                        codeText,
                                                        "shell",
                                                      )
                                                    }
                                                  >
                                                    <Zap size={12} />
                                                  </button>
                                                </div>
                                              </div>
                                              <code
                                                className={className}
                                                {...props}
                                              >
                                                {children}
                                              </code>
                                            </div>
                                          ) : (
                                            <code
                                              className={className}
                                              {...props}
                                            >
                                              {children}
                                            </code>
                                          );
                                        },
                                      }}
                                    >
                                      {block.explanation}
                                    </ReactMarkdown>
                                  </div>
                                )}
                                {block.actions && block.actions.length > 0 && (
                                  <div className="workflow-actions">
                                    {block.actions.map((action, idx) => (
                                      <div key={idx} className="workflow-step">
                                        <div
                                          className={`workflow-step-icon ${
                                            action.status || "pending"
                                          }`}
                                        >
                                          {action.status === "completed" ? (
                                            <CheckCircle2 size={14} />
                                          ) : action.type === "run" ? (
                                            <Play size={12} />
                                          ) : (
                                            <FilePlus size={12} />
                                          )}
                                        </div>
                                        <div className="workflow-step-label">
                                          {action.label}
                                        </div>
                                        <button
                                          className={`workflow-step-btn ${
                                            action.status === "completed"
                                              ? "completed"
                                              : ""
                                          }`}
                                          onClick={() =>
                                            handleRunAction(block.id, idx)
                                          }
                                          disabled={
                                            action.status === "running" ||
                                            action.status === "completed"
                                          }
                                        >
                                          {action.status === "running"
                                            ? "Running..."
                                            : action.status === "completed"
                                              ? "Done"
                                              : "Execute"}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {block.status === "completed" &&
                                  block.type === "shell" &&
                                  block.output.trim().startsWith("[") &&
                                  block.output.trim().endsWith("]") &&
                                  (() => {
                                    try {
                                      const parsed = JSON.parse(block.output);
                                      if (
                                        Array.isArray(parsed) &&
                                        parsed.length > 0 &&
                                        typeof parsed[0] === "object"
                                      ) {
                                        const keys = Object.keys(
                                          parsed[0],
                                        ).slice(0, 6);
                                        return (
                                          <div className="smart-visualizer">
                                            <table className="sv-table">
                                              <thead>
                                                <tr>
                                                  {keys.map((k) => (
                                                    <th key={k}>{k}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {parsed
                                                  .slice(0, 15)
                                                  .map((row, rIdx) => (
                                                    <tr key={rIdx}>
                                                      {keys.map((k) => (
                                                        <td key={k}>
                                                          {String(row[k]).slice(
                                                            0,
                                                            50,
                                                          )}
                                                        </td>
                                                      ))}
                                                    </tr>
                                                  ))}
                                              </tbody>
                                            </table>
                                            {parsed.length > 15 && (
                                              <div className="sv-more">
                                                ... and {parsed.length - 15}{" "}
                                                more rows
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                    } catch {}
                                    return null;
                                  })()}
                                {(block.output ||
                                  block.status === "executing") && (
                                  <div className="block-output">
                                    <Ansi>{block.output}</Ansi>
                                  </div>
                                )}
                                {block.type === "shell" &&
                                  block.status === "completed" &&
                                  block.output
                                    .toLowerCase()
                                    .includes("error") &&
                                  !block.analysis && (
                                    <div className="error-actions-group">
                                      <button
                                        className="error-analyze-btn"
                                        onClick={() =>
                                          handleAnalyzeError(block)
                                        }
                                      >
                                        <Zap size={12} /> AI Analyze
                                      </button>
                                      <button
                                        className="error-autofix-btn"
                                        onClick={() => handleAutoFix(block)}
                                      >
                                        <Play size={12} /> Auto-Fix
                                      </button>
                                    </div>
                                  )}
                              </div>
                            )}
                          />
                        </div>
                      </Panel>,
                    ];
                    if (i < activeTab.panes.length - 1) {
                      elements.push(
                        <PanelResizeHandle
                          id={`handle-${pane.id}`}
                          key={`handle-${pane.id}`}
                          className="pane-resize-handle"
                        />,
                      );
                    }
                    return elements;
                  })}
                </PanelGroup>
              ) : (
                <div className="empty-state">No Active Panes</div>
              )}
            </div>
          </Panel>

          {showWebview && (
            <PanelResizeHandle
              id="webview-handle"
              className="pane-resize-handle"
            />
          )}
          {showWebview && (
            <Panel id="webview-section" defaultSize={40} minSize={20}>
              <div className="webview-container">
                <div className="webview-toolbar">
                  <div className="webview-address-bar">
                    <Globe size={12} />
                    <input
                      type="text"
                      value={webviewInput}
                      onChange={(e) => setWebviewUrlInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && setWebviewUrl(webviewInput)
                      }
                    />
                  </div>
                  <button
                    className="webview-refresh"
                    onClick={() => {
                      const old = webviewUrl;
                      setWebviewUrl("");
                      setTimeout(() => setWebviewUrl(old), 10);
                    }}
                  >
                    <RefreshCcw size={14} />
                  </button>
                  <button
                    className="webview-close"
                    onClick={() => setShowWebview(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <iframe
                  src={webviewUrl}
                  className="webview-frame"
                  title="Visual Context"
                />
              </div>
            </Panel>
          )}
        </PanelGroup>
      </main>

      <CommandInput
        onCommandSubmit={handleCommand}
        selectedModel={selectedModel}
        ollamaOnline={ollamaOnline}
        context={context}
      />

      {isSettingsOpen && (
        <div
          className="settings-overlay"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <div className="settings-tabs">
                <button
                  className={`settings-tab ${settingsTab === "general" ? "active" : ""}`}
                  onClick={() => setSettingsTab("general")}
                >
                  General
                </button>
                <button
                  className={`settings-tab ${settingsTab === "models" ? "active" : ""}`}
                  onClick={() => setSettingsTab("models")}
                >
                  Models
                </button>
              </div>
              <button onClick={() => setIsSettingsOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="settings-body">
              {settingsTab === "general" ? (
                <div className="settings-view">
                  <div className="setting-item">
                    <label>Intelligence</label>
                    <button
                      className={`index-btn ${isIndexing ? "indexing" : ""}`}
                      onClick={handleIndexProject}
                      disabled={isIndexing || !ollamaOnline}
                    >
                      {isIndexing ? (
                        <Loader2 size={14} className="animate-pulse" />
                      ) : (
                        <BrainCircuit size={14} />
                      )}
                      {isIndexing
                        ? "Indexing Codebase..."
                        : "Index Codebase (Full RAG)"}
                    </button>
                    {indexProgress && (
                      <div className="index-progress-mini">
                        <div className="progress-bar-bg">
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${(indexProgress.current / indexProgress.total) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="index-progress-text">
                          {indexProgress.current} / {indexProgress.total} chunks
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="setting-item">
                    <label>Gemini API Key</label>
                    <div className="api-key-input-container">
                      <input
                        type="password"
                        placeholder="Enter your Gemini API Key"
                        value={config.gemini_api_key || ""}
                        onChange={(e) =>
                          updateConfig({ gemini_api_key: e.target.value })
                        }
                      />
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="api-key-link"
                      >
                        Get Key
                      </a>
                    </div>
                  </div>
                  <div className="setting-item">
                    <label>WebGPU Acceleration</label>
                    <div className={`status-badge ${wgpuSupported ? "online" : "offline"}`}>
                      {wgpuSupported === null
                        ? "Checking..."
                        : wgpuSupported
                          ? "Supported"
                          : "Not Supported"}
                    </div>
                  </div>
                  <div className="setting-item">
                    <label>Font Size ({config.font_size}px)</label>

                    <input
                      type="range"
                      min="10"
                      max="24"
                      value={config.font_size}
                      onChange={(e) =>
                        updateConfig({ font_size: parseInt(e.target.value) })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>
                      Opacity ({Math.round(config.opacity * 100)}%)
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="1"
                      step="0.05"
                      value={config.opacity}
                      onChange={(e) =>
                        updateConfig({ opacity: parseFloat(e.target.value) })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>Accent Color</label>
                    <div className="color-presets">
                      {["#00d4aa", "#a78bfa", "#58a6ff", "#f85149", "#d29922"].map(
                        (color) => (
                          <div
                            key={color}
                            className={`color-swatch ${config.accent_color === color ? "active" : ""}`}
                            style={{ background: color }}
                            onClick={() => updateConfig({ accent_color: color })}
                          />
                        ),
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="settings-view models-manager">
                  {pullProgress && (
                    <div className="pull-progress-card">
                      <div className="pull-status">{pullProgress.status}...</div>
                      {pullProgress.total && pullProgress.completed && (
                        <div className="progress-bar-bg">
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${(pullProgress.completed / pullProgress.total) * 100}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="model-section">
                    <h4>Installed Models</h4>
                    <div className="model-list">
                      {models.map((m) => (
                        <div key={m} className="model-item">
                          <HardDrive size={14} className="model-icon" />
                          <span className="model-name">{m}</span>
                          <button
                            className="model-delete-btn"
                            onClick={() => handleDeleteModel(m)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="model-section">
                    <h4>Available to Download</h4>
                    <div className="model-list">
                      {POPULAR_MODELS.map((pm) => (
                        <div key={pm.name} className="model-item available">
                          <div className="model-info">
                            <span className="model-name">
                              {pm.name} <small>({pm.size})</small>
                            </span>
                            <span className="model-desc">{pm.desc}</span>
                          </div>
                          {models.includes(pm.name) ||
                          models.some((m) => m.startsWith(pm.name)) ? (
                            <span className="model-badge">Installed</span>
                          ) : (
                            <button
                              className="model-download-btn"
                              onClick={() => handlePullModel(pm.name)}
                              disabled={!!pullProgress}
                            >
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
