/**
 * Tauri invoke 모킹 — 실제 Tauri 바이너리 없이 브라우저 컨텍스트에서 테스트를 실행할 수 있게 함.
 *
 * @tauri-apps/api/core 의 invoke()는 내부적으로 window.__TAURI_INTERNALS__.ipc 또는
 * window.__TAURI_INTERNALS__.invoke 를 호출한다.
 * 여기서는 모든 invoke 호출이 예외를 던지지 않고 null(또는 적절한 기본값)을 반환하도록 설정한다.
 */
export async function setupTauriMock(): Promise<void> {
  // @tauri-apps/api v2 의 내부 인터페이스 모킹
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_INTERNALS__ = {
    /**
     * invoke 는 커맨드 이름과 인수를 받아 결과를 반환한다.
     * 테스트에서는 명령별 기본값을 반환해 UI가 오류 없이 렌더링되도록 한다.
     */
    invoke: async (cmd: string, _args?: unknown): Promise<unknown> => {
      switch (cmd) {
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
          return {};

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

    // Tauri v2 내부에서 사용하는 transformCallback 스텁
    transformCallback: (callback: (response: unknown) => void, once?: boolean): number => {
      void once;
      void callback;
      return Math.floor(Math.random() * 1000000);
    },
  };
}
