import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ModelManager, {
  getModelManagerEmptyMeta,
  getModelManagerFlowMeta,
} from "./ModelManager";

const invokeMock = vi.fn();
const listenMock = vi.fn(async (_event: string, _handler: unknown) => async () => {});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: unknown) => listenMock(event, handler),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("../hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    catalog: { mlx: [], exl2: [], heavy_presets: [] },
    loading: false,
  }),
}));

function setupClipboardWriteMock() {
  type WriteSpy = ReturnType<typeof vi.fn>;
  type RestoreSpy = ReturnType<typeof vi.spyOn>;
  const writeText = vi.fn().mockResolvedValue(undefined);
  const nav = globalThis.navigator as Navigator & {
    clipboard?: { writeText: WriteSpy };
  };
  const originalClipboard = nav.clipboard;

  if (originalClipboard) {
    return {
      writeText,
      restore: vi.spyOn(originalClipboard, "writeText").mockResolvedValue(undefined) as RestoreSpy,
    };
  }

  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  return {
    writeText,
    restore: null as RestoreSpy | null,
  };
}

describe("ModelManager", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "list_mistral_models") {
        return Promise.resolve([
          {
            repo_id: "Qwen/Qwen3-8B",
            path: "/tmp/qwen",
            size_mb: 1000,
          },
        ]);
      }
      if (cmd === "save_xllm_settings") {
        return Promise.resolve(args ?? {});
      }
      if (cmd === "delete_mistral_model") {
        return Promise.resolve(args ?? {});
      }
      if (cmd === "pick_model_dir") return Promise.resolve(null);
      if (cmd === "save_model_download_dir") return Promise.resolve(args ?? {});
      if (cmd === "save_hf_token") return Promise.resolve(args ?? {});
      if (cmd === "download_mistral_model") return Promise.resolve("/tmp/model.gguf");
      if (cmd === "cancel_mistral_download") return Promise.resolve(args ?? {});
      if (cmd === "check_repo_status") return Promise.resolve([]);
      return Promise.resolve({});
    });
  });

  it("상단 흐름과 빈 상태 메타를 계산한다", () => {
    expect(getModelManagerFlowMeta()).toEqual({
      badges: ["먼저 선택", "다음 역할 지정", "마지막 정리"],
      helper: "설치된 모델을 고르고, 코딩·문서 역할을 지정한 뒤 필요 없는 모델만 정리합니다.",
    });
    expect(getModelManagerEmptyMeta()).toEqual({
      badges: ["먼저 다운로드", "다음 역할 지정", "마지막 관리"],
      title: "설치된 모델이 없습니다.",
      description: "다운로드 탭에서 mistral.rs용 모델을 받으세요.",
      detail: "모델을 받은 뒤 코딩·문서 역할을 정하고, 필요 없는 모델만 남겨 관리합니다.",
    });
  });

  it("역할 지정 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    invokeMock.mockReset();
    const clipboardMock = setupClipboardWriteMock();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "list_mistral_models") {
        return Promise.resolve([
          {
            repo_id: "Qwen/Qwen3-8B",
            path: "/tmp/qwen",
            size_mb: 1000,
          },
        ]);
      }
      if (cmd === "save_xllm_settings") return Promise.reject({ message: "모델 설정 저장 실패" });
      if (cmd === "save_hf_token") return Promise.resolve(args ?? {});
      if (cmd === "delete_mistral_model") return Promise.resolve(args ?? {});
      if (cmd === "pick_model_dir") return Promise.resolve(null);
      if (cmd === "save_model_download_dir") return Promise.resolve(args ?? {});
      if (cmd === "download_mistral_model") return Promise.resolve("/tmp/model.gguf");
      if (cmd === "cancel_mistral_download") return Promise.resolve(args ?? {});
      if (cmd === "check_repo_status") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<ModelManager onClose={vi.fn()} />);

    expect(await screen.findByText("먼저 선택")).toBeInTheDocument();
    expect(screen.getByText("다음 역할 지정")).toBeInTheDocument();
    expect(screen.getByText("마지막 정리")).toBeInTheDocument();
    expect(screen.getByText("현재 모델")).toBeInTheDocument();
    expect(screen.getByText("역할 지정")).toBeInTheDocument();
    expect(screen.getByText("삭제 가능")).toBeInTheDocument();
    expect(screen.getByText("모델 정보를 먼저 보고, 역할을 정한 뒤 마지막에 삭제 여부를 판단합니다.")).toBeInTheDocument();
    const codingBtn = await screen.findByRole("button", { name: "💻 코딩용으로 지정" });
    fireEvent.click(codingBtn);

    expect(await screen.findByText("❌ 역할 지정 실패: 모델 설정 저장 실패")).toBeInTheDocument();
    const copyButton = await screen.findByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("❌ 역할 지정 실패: 모델 설정 저장 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("❌ 역할 지정 실패: 모델 설정 저장 실패");
    }
  });

  it("설치된 모델이 없을 때 다음 행동 흐름을 안내한다", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "list_mistral_models") return Promise.resolve([]);
      if (cmd === "save_xllm_settings") return Promise.resolve(args ?? {});
      if (cmd === "pick_model_dir") return Promise.resolve(null);
      if (cmd === "save_model_download_dir") return Promise.resolve(args ?? {});
      if (cmd === "save_hf_token") return Promise.resolve(args ?? {});
      if (cmd === "download_mistral_model") return Promise.resolve("/tmp/model.gguf");
      if (cmd === "cancel_mistral_download") return Promise.resolve(args ?? {});
      if (cmd === "check_repo_status") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<ModelManager onClose={vi.fn()} />);

    expect(await screen.findByText("먼저 다운로드")).toBeInTheDocument();
    expect(screen.getAllByText("다음 역할 지정").length).toBeGreaterThan(0);
    expect(screen.getAllByText("마지막 관리").length).toBeGreaterThan(0);
    expect(screen.getByText("설치된 모델이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("다운로드 탭에서 mistral.rs용 모델을 받으세요.")).toBeInTheDocument();
    expect(screen.getByText("모델을 받은 뒤 코딩·문서 역할을 정하고, 필요 없는 모델만 남겨 관리합니다.")).toBeInTheDocument();
  });
});
