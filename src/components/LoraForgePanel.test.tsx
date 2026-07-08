import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoraForgePanel from "./LoraForgePanel";

const useLoraForgeMock = vi.fn();

vi.mock("../hooks/useLoraForge", () => ({
  useLoraForge: () => useLoraForgeMock(),
}));

type WriteSpy = ReturnType<typeof vi.fn>;
type RestoreSpy = ReturnType<typeof vi.spyOn>;

function setupClipboardWriteMock() {
  const writeText = vi.fn().mockResolvedValue(undefined) as WriteSpy;
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

describe("LoraForgePanel", () => {
  beforeEach(() => {
    useLoraForgeMock.mockReturnValue({
      runs: [],
      runtimes: null,
      autoStatus: null,
      autoEvents: [],
      liveLogs: {},
      error: "모델 학습 리스트 조회 실패",
      start: vi.fn(async () => ({
        id: "run-1",
        task: "",
        status: "running",
        runtime: "mlx-lm",
        base_model: "",
        iters: 0,
        lora_rank: 0,
        learning_rate: 0,
        dataset_path: "",
        output_dir: "",
        log_tail: [],
        ts_started_ms: Date.now(),
        ts_ended_ms: null,
        exit_code: null,
      })),
      cancel: vi.fn(),
      remove: vi.fn(),
      canLoad: vi.fn(async () => false),
      saveAutoSettings: vi.fn(async () => undefined),
      dismissAutoEvent: vi.fn(),
    });
  });

  it("상위 에러 배너에서 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();

    render(
      <TooltipProvider>
        <LoraForgePanel onClose={vi.fn()} />
      </TooltipProvider>,
    );

    const errorText = await screen.findByText("모델 학습 리스트 조회 실패");
    expect(errorText).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("모델 학습 리스트 조회 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("모델 학습 리스트 조회 실패");
    }
  });
});
