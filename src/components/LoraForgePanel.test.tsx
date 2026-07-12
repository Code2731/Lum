import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoraForgePanel, {
  getLoraForgeEmptyFlowSummary,
  getLoraForgeFormFlowSummary,
  getLoraForgePrimaryFlowSummary,
} from "./LoraForgePanel";

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

  it("Forge 단계별 흐름 요약을 계산한다", () => {
    expect(getLoraForgePrimaryFlowSummary()).toEqual({
      badges: ["먼저 데이터 준비", "다음 Forge 실행", "마지막 어댑터 활용"],
      helper: "healing 데이터셋과 베이스 모델을 먼저 확인하고, Forge 실행 후 완료된 어댑터를 추론이나 후속 학습 흐름에 연결합니다.",
    });

    expect(getLoraForgeFormFlowSummary("", false)).toEqual({
      badges: ["작업 이름", "런타임·모델 확인", "iters·rank·lr"],
      helper: "학습 목적을 적기 전에 사용할 런타임 설치 상태와 베이스 모델을 먼저 확인한 뒤 Forge를 준비합니다.",
    });

    expect(getLoraForgeFormFlowSummary("docker 빌드 실패 패턴 학습", true)).toEqual({
      badges: ["작업 이름 입력됨", "런타임·모델 준비", "iters·rank·lr"],
      helper: "학습 목적을 먼저 적고, 사용할 런타임과 베이스 모델을 정한 뒤 학습 파라미터를 조절해 Forge를 시작합니다.",
    });

    expect(getLoraForgeEmptyFlowSummary()).toEqual({
      badges: ["첫 Forge 시작", "로그 확인", "완료 후 로드"],
      helper: "학습을 한 번 시작하면 진행 로그와 결과 디렉터리를 이 패널에서 계속 확인하고, 완료 후 어댑터 활용 여부를 결정할 수 있습니다.",
    });
  });

  it("초기 상태에서 Forge 흐름 안내를 보여준다", () => {
    render(
      <TooltipProvider>
        <LoraForgePanel onClose={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByText("먼저 데이터 준비")).toBeInTheDocument();
    expect(screen.getByText("다음 Forge 실행")).toBeInTheDocument();
    expect(screen.getByText("마지막 어댑터 활용")).toBeInTheDocument();
    expect(
      screen.getByText("healing 데이터셋과 베이스 모델을 먼저 확인하고, Forge 실행 후 완료된 어댑터를 추론이나 후속 학습 흐름에 연결합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("작업 이름")).toBeInTheDocument();
    expect(screen.getByText("런타임·모델")).toBeInTheDocument();
    expect(screen.getByText("iters·rank·lr")).toBeInTheDocument();
    expect(screen.getByText("첫 Forge 시작")).toBeInTheDocument();
    expect(screen.getByText("로그 확인")).toBeInTheDocument();
    expect(screen.getByText("완료 후 로드")).toBeInTheDocument();
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
