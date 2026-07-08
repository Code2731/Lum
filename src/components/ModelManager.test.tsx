import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ModelManager from "./ModelManager";

const invokeMock = vi.fn();
const listenMock = vi.fn(async () => async () => {});

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
});
