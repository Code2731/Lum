import { describe, expect, it } from "vitest";
import { getHardwareSpecsMeta, type HardwareSpecs } from "./useHardwareSpecs";

describe("useHardwareSpecs helpers", () => {
  it("specs가 없으면 감지 대기 메타를 반환한다", () => {
    expect(getHardwareSpecsMeta(null)).toEqual({
      title: "하드웨어 감지 대기 중",
      badges: ["먼저 시스템 확인", "다음 추천 엔진 계산", "마지막 모델 추천"],
      helper: "메모리, CPU, GPU 정보를 읽은 뒤 현재 장치에 맞는 실행 엔진과 모델을 추천합니다.",
    });
  });

  it("하드웨어 감지 결과를 추천 엔진 중심 메타로 요약한다", () => {
    const specs: HardwareSpecs = {
      total_memory_gb: 32,
      available_memory_gb: 18.4,
      cpu_cores: 12,
      gpu_type: "discrete",
      wgpu_supported: true,
      gpu_name: "RTX 4070",
      gpu_vram_gb: 12,
      recommended_engine: "xllm",
      recommended_model: "Qwen/Qwen3-8B",
      recommendation_reason: "여유 VRAM과 메모리가 충분해 가속 엔진이 적합합니다.",
    };

    expect(getHardwareSpecsMeta(specs)).toEqual({
      title: "가속 엔진 추천 · Qwen/Qwen3-8B",
      badges: ["메모리 18/32GB", "RTX 4070 12GB", "권장 XLLM"],
      helper: "여유 VRAM과 메모리가 충분해 가속 엔진이 적합합니다.",
    });
  });

  it("GPU가 없으면 GPU 없음 배지를 사용한다", () => {
    const specs: HardwareSpecs = {
      total_memory_gb: 16,
      available_memory_gb: 7.6,
      cpu_cores: 8,
      gpu_type: "none",
      wgpu_supported: false,
      gpu_name: "",
      recommended_engine: "cpu",
      recommended_model: "Qwen/Qwen2.5-Coder-3B-Instruct",
      recommendation_reason: "GPU가 없어 CPU 경로가 안정적입니다.",
    };

    expect(getHardwareSpecsMeta(specs)).toEqual({
      title: "CPU 엔진 추천 · Qwen/Qwen2.5-Coder-3B-Instruct",
      badges: ["메모리 8/16GB", "GPU 없음", "권장 CPU"],
      helper: "GPU가 없어 CPU 경로가 안정적입니다.",
    });
  });
});
