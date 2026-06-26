/**
 * Tauri invoke 모킹 — 실제 Tauri 바이너리 없이 브라우저 컨텍스트에서 테스트를 실행할 수 있게 함.
 *
 * @tauri-apps/api/core 의 invoke()는 내부적으로 window.__TAURI_INTERNALS__.ipc 또는
 * window.__TAURI_INTERNALS__.invoke 를 호출한다.
 * 여기서는 모든 invoke 호출이 예외를 던지지 않고 null(또는 적절한 기본값)을 반환하도록 설정한다.
 */
export async function setupTauriMock(): Promise<void> {
  // @tauri-apps/api v2 내부 인터페이스 모킹 (window/event/core/window 모듈 공통)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  // E2E에서는 초기 웰컴 힌트 모달을 기본적으로 숨겨 상호작용을 안정화한다.
  try {
    localStorage.setItem("lum.hintsShown", "1");
  } catch {
    // noop
  }
  const readMockConfig = () => {
    try {
      const raw = localStorage.getItem("lum.mock.appConfig");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };
  const writeMockConfig = (next: Record<string, unknown>) => {
    try {
      localStorage.setItem("lum.mock.appConfig", JSON.stringify(next));
    } catch {
      // noop
    }
  };
  const callbacks = new Map<number, (payload: unknown) => void>();
  const eventListeners = new Map<string, Set<number>>();
  const invokeCalls: Array<{ cmd: string; args: unknown }> = [];
  let callbackSeq = 1;

  const transformCallback = (callback?: (payload: unknown) => void, once?: boolean): number => {
    const id = callbackSeq++;
    callbacks.set(id, (payload: unknown) => {
      callback?.(payload);
      if (once) callbacks.delete(id);
    });
    return id;
  };

  const unregisterCallback = (id: number): void => {
    callbacks.delete(id);
  };

  const runCallback = (id: number, payload: unknown): void => {
    callbacks.get(id)?.(payload);
  };

  const emitTauriEvent = (event: string, payload: unknown): void => {
    for (const id of eventListeners.get(event) ?? []) {
      runCallback(id, { payload });
    }
  };
  const directoryEntries: Record<string, Array<{ name: string; path: string; is_dir: boolean; size: number }>> = {
    "~": [
      { name: "project", path: "/workspace/project", is_dir: true, size: 0 },
      { name: "notes.txt", path: "/workspace/notes.txt", is_dir: false, size: 128 },
    ],
    "/workspace/project": [
      { name: "src", path: "/workspace/project/src", is_dir: true, size: 0 },
      { name: "README.md", path: "/workspace/project/README.md", is_dir: false, size: 512 },
    ],
    "/workspace/project/src": [],
  };

  w.__TAURI_INTERNALS__ = {
    /**
     * invoke 는 커맨드 이름과 인수를 받아 결과를 반환한다.
     * 테스트에서는 명령별 기본값을 반환해 UI가 오류 없이 렌더링되도록 한다.
     */
    invoke: async (cmd: string, args?: unknown): Promise<unknown> => {
      invokeCalls.push({ cmd, args });
      switch (cmd) {
        case "plugin:event|listen":
          {
            const listenArgs = args as { event?: string; handler?: number } | undefined;
            const eventName = listenArgs?.event;
            const handlerId = listenArgs?.handler ?? 0;
            if (eventName) {
              const handlers = eventListeners.get(eventName) ?? new Set<number>();
              handlers.add(handlerId);
              eventListeners.set(eventName, handlers);
            }
            return handlerId;
          }
        case "plugin:event|unlisten":
          {
            const unlistenArgs = args as { event?: string; eventId?: number } | undefined;
            if (unlistenArgs?.event && typeof unlistenArgs.eventId === "number") {
              eventListeners.get(unlistenArgs.event)?.delete(unlistenArgs.eventId);
            }
          }
          return null;
        case "plugin:event|emit":
          return null;
        case "reset_ai_stream":
          return null;
        case "cancel_ai_stream":
          return null;
        case "verify_command_safety":
          return {
            level: "Safe",
            reason: "mock",
          };
        case "stream_ai_command":
          {
            const streamArgs = args as { prompt?: string } | undefined;
            const prompt = streamArgs?.prompt ?? "";
            const answer = prompt.includes("아래 실패한 터미널 실행을 분석해줘.")
              ? [
                  "원인: command not found",
                  "",
                  "```bash",
                  "pwd",
                  "echo badcmd",
                  "which badcmd",
                  "```",
                ].join("\n")
              : `Mock AI 응답: ${prompt}`;
            for (const token of [answer.slice(0, Math.ceil(answer.length / 2)), answer.slice(Math.ceil(answer.length / 2))]) {
              emitTauriEvent("xllm_token", token);
            }
            return null;
          }

        // 온보딩 완료 상태 — true를 반환해 온보딩 위저드가 뜨지 않도록 함
        case "check_onboarding_complete":
          return true;

        // xLLM 서버 상태 — false (오프라인)로 반환
        case "check_xllm_status":
          return false;

        // 하드웨어 스펙 — 최소 필드로 구성된 객체 반환
        case "get_hardware_specs":
          return {
            total_memory_gb: 16,
            gpu_type: "cpu",
            recommended_model: "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw",
            recommendation_reason: "mock",
          };

        // 업데이트 체크 — null 반환 (배너 미표시)
        case "check_for_update":
          return null;

        // 설정 로드 — 빈 객체
        case "load_config":
          return readMockConfig();
        case "load_app_config":
          return {
            show_reasoning: true,
            vision_enabled: false,
            toolbar_show_advanced: false,
            ui_show_file_explorer: true,
            ui_hints_shown: true,
            ui_seen_advanced_features: [],
            ...readMockConfig(),
          };
        case "save_ui_preferences":
          {
            const prev = readMockConfig();
            const saveArgs = (args as Record<string, unknown> | undefined) ?? {};
            const next = {
              ...prev,
              ...(saveArgs.showFileExplorer !== undefined ? { ui_show_file_explorer: !!saveArgs.showFileExplorer } : {}),
              ...(saveArgs.showInspector !== undefined ? { ui_show_inspector: !!saveArgs.showInspector } : {}),
              ...(saveArgs.aiChatFontSize !== undefined ? { ui_ai_chat_font_size: saveArgs.aiChatFontSize } : {}),
            };
            writeMockConfig(next);
            return null;
          }

        // 세션 로드 — null (새 세션)
        case "load_session":
          return null;

        // 최근 히스토리 — 빈 배열
        case "get_recent_history":
          return [];

        // 프로젝트 컨텍스트 — 빈 문자열
        case "get_project_context":
          return "";

        // 워크스페이스 목록 — 빈 배열
        case "list_workspaces":
          return [];
        case "squad_list":
          return [];
        case "list_scripts":
          return [];
        case "list_mcp_servers":
          return [];
        case "list_healing_dataset":
          return [];
        case "lora_forge_list":
          return [];
        case "list_directory":
          {
            const dirArgs = args as { path?: string } | undefined;
            return directoryEntries[dirArgs?.path ?? ""] ?? [];
          }
        case "parent_directory":
          {
            const dirArgs = args as { path?: string } | undefined;
            const path = dirArgs?.path ?? "";
            if (path === "~" || !path) return null;
            if (path === "/workspace/project/src") return "/workspace/project";
            if (path === "/workspace/project") return "~";
            return null;
          }

        // 퀵 액션 로드 — 빈 배열
        case "load_quick_actions":
          return [];

        // 터미널 외관 로드 — null (기본값 사용)
        case "load_terminal_appearance":
          return null;

        // 기타 모든 커맨드 — null 반환 (예외 없음)
        default:
          return null;
      }
    },
    transformCallback,
    unregisterCallback,
    runCallback,
    callbacks,
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    convertFileSrc: (filePath: string, protocol = "asset"): string =>
      `${protocol}://localhost/${encodeURIComponent(filePath)}`,
    plugins: {
      path: {
        sep: "/",
        delimiter: ":",
      },
    },
  };

  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (event: string, id: number) => {
      void event;
      eventListeners.get(event)?.delete(id);
      unregisterCallback(id);
    },
  };

  w.__lumTest = {
    emitTauriEvent,
    getInvokeCalls: () => invokeCalls.slice(),
    resetInvokeCalls: () => {
      invokeCalls.length = 0;
    },
  };
}
