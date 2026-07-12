import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SetupWizard, { getSetupWizardFlowSummary } from "./SetupWizard";

const baseProps = {
  setStep: vi.fn(),
  onClose: vi.fn(),
  hardwareSpecs: {
    gpu_type: "discrete",
    gpu_vram_gb: 12,
    total_memory_gb: 32,
    wgpu_supported: true,
  },
  pullProgress: null,
  handlePullModel: vi.fn(),
  models: [],
  recommendedModel: "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw",
  syncXllm: vi.fn(async () => undefined),
};

describe("SetupWizard", () => {
  it("요약 함수는 단계별 상태를 반환한다", () => {
    expect(
      getSetupWizardFlowSummary({
        step: 1,
        recommendedModel: "model",
        pullProgress: null,
      }),
    ).toEqual({
      primary: "xLLM 연결 준비",
      secondary: "서버 확인 필요",
      detail: "xLLM 서버를 먼저 실행하고 연결 여부를 확인한 뒤 다음 단계에서 추천 모델을 선택할 수 있습니다.",
    });
    expect(
      getSetupWizardFlowSummary({
        step: 2,
        recommendedModel: "model",
        pullProgress: null,
      }),
    ).toEqual({
      primary: "추천 모델 준비",
      secondary: "model",
      detail: "감지된 사양과 추천 모델을 확인한 뒤 바로 로드를 시작할 수 있습니다.",
    });
    expect(
      getSetupWizardFlowSummary({
        step: 3,
        recommendedModel: "model",
        pullProgress: null,
      }),
    ).toEqual({
      primary: "설정 완료 준비",
      secondary: "시작 직전",
      detail: "핵심 준비가 끝나 있어 바로 터미널과 에이전트 흐름을 시작할 수 있습니다.",
    });
  });

  it("1단계에서 서버 확인 흐름 안내를 보여준다", () => {
    render(<SetupWizard {...baseProps} step={1} />);

    expect(screen.getByText("xLLM 연결 준비")).toBeInTheDocument();
    expect(screen.getByText("서버 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("마지막 시작")).toBeInTheDocument();
    expect(
      screen.getByText("xLLM 서버를 먼저 실행하고 연결 여부를 확인한 뒤 다음 단계에서 추천 모델을 선택할 수 있습니다."),
    ).toBeInTheDocument();
  });

  it("2단계에서 모델 준비 흐름 안내를 보여준다", () => {
    render(<SetupWizard {...baseProps} step={2} />);

    expect(screen.getByText("추천 모델 준비")).toBeInTheDocument();
    expect(screen.getByText("Qwen2.5-Coder-7B-Instruct-EXL2-4bpw")).toBeInTheDocument();
    expect(screen.getByText("마지막 시작")).toBeInTheDocument();
  });

  it("3단계에서 완료 흐름 안내를 보여준다", () => {
    render(<SetupWizard {...baseProps} step={3} />);

    expect(screen.getByText("설정 완료 준비")).toBeInTheDocument();
    expect(screen.getByText("시작 직전")).toBeInTheDocument();
    expect(screen.getByText("마지막 시작")).toBeInTheDocument();
  });
});
