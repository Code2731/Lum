import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OnboardingWizard from "./OnboardingWizard";

const mockSpecs = {
  total_memory_gb: 32,
  available_memory_gb: 16,
  cpu_cores: 8,
  gpu_type: "discrete" as const,
  gpu_name: "RTX 3080",
  wgpu_supported: true,
  recommended_engine: "xllm" as const,
  recommended_model: "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw",
  recommendation_reason: "외장 GPU 감지, 충분한 VRAM",
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === "get_hardware_specs") return Promise.resolve(mockSpecs);
    if (cmd === "check_xllm_status") return Promise.resolve(true);
    if (cmd === "list_local_models") return Promise.resolve([]);
    if (cmd === "complete_onboarding") return Promise.resolve();
    return Promise.resolve(null);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe("OnboardingWizard", () => {
  it("Step 0: 환영 화면 렌더링", () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText("LUM에 오신 것을 환영합니다")).toBeInTheDocument();
    expect(screen.getByText("시작하기")).toBeInTheDocument();
  });

  it("Step 0 → Step 1: 시작하기 클릭 시 하드웨어 분석 단계로 이동", async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByText("시작하기"));
    await waitFor(() => {
      expect(screen.getByText("하드웨어 자동 분석")).toBeInTheDocument();
    });
  });

  it("Step 1: 하드웨어 스펙 표시", async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByText("시작하기"));
    await waitFor(() => {
      expect(screen.getByText("32 GB")).toBeInTheDocument();
      expect(screen.getByText(/Qwen2\.5-Coder-7B/)).toBeInTheDocument();
    });
  });

  it("Step 2: xLLM 연결됨 표시", async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByText("시작하기"));
    await waitFor(() => screen.getByText("다음"));
    fireEvent.click(screen.getByText("다음"));
    await waitFor(() => {
      expect(screen.getByText("TabbyAPI 연결됨")).toBeInTheDocument();
    });
  });

  it("Step 2: xLLM 미연결 시 설치 가이드 표시", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_hardware_specs") return Promise.resolve(mockSpecs);
      if (cmd === "check_xllm_status") return Promise.resolve(false);
      return Promise.resolve(null);
    });

    render(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByText("시작하기"));
    await waitFor(() => screen.getByText("다음"));
    fireEvent.click(screen.getByText("다음"));
    await waitFor(() => {
      expect(screen.getByText(/pip install tabbyapi/)).toBeInTheDocument();
    });
  });

  it("진행 바가 단계에 따라 채워짐 (5개 세그먼트)", () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    const bars = document.querySelectorAll(".h-1.flex-1.rounded-full");
    expect(bars.length).toBe(5);
  });

  it("완료 단계에서 onComplete 콜백 호출", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);

    // step 0 → 1
    fireEvent.click(screen.getByText("시작하기"));
    // step 1: 하드웨어 스펙 로딩 완료 후 다음 (specs 없으면 버튼 disabled)
    await waitFor(() => expect(screen.getByText("다음")).not.toBeDisabled());
    fireEvent.click(screen.getByText("다음"));
    // step 2: xLLM 상태 확인 후 다음 (연결/미연결 어느 쪽이든 진행)
    await waitFor(() => screen.getByText(/TabbyAPI (연결됨|미연결)/));
    fireEvent.click(screen.getByText("다음"));
    // step 3: 모델 준비 화면 진입 후 다음
    await waitFor(() => screen.getByText("AI 모델 준비"));
    fireEvent.click(screen.getByText("다음"));
    // step 4: 완료
    fireEvent.click(await screen.findByText("터미널 시작하기"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
  });
});
