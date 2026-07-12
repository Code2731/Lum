import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface HardwareSpecs {
  total_memory_gb: number;
  available_memory_gb: number;
  cpu_cores: number;
  gpu_type: "discrete" | "integrated" | "none";
  wgpu_supported: boolean;
  gpu_name: string;
  gpu_vram_gb?: number; // Windows 외장 GPU VRAM (없으면 undefined)
  recommended_engine: "xllm" | "cpu";
  recommended_model: string;
  recommendation_reason: string;
}

export interface HardwareSpecsMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

function formatMemoryLabel(total: number, available: number): string {
  return `메모리 ${available.toFixed(0)}/${total.toFixed(0)}GB`;
}

function formatGpuLabel(specs: HardwareSpecs): string {
  if (specs.gpu_type === "none" || !specs.gpu_name.trim()) {
    return "GPU 없음";
  }
  return specs.gpu_vram_gb
    ? `${specs.gpu_name} ${specs.gpu_vram_gb.toFixed(0)}GB`
    : specs.gpu_name;
}

export function getHardwareSpecsMeta(specs: HardwareSpecs | null): HardwareSpecsMeta {
  if (!specs) {
    return {
      title: "하드웨어 감지 대기 중",
      badges: ["먼저 시스템 확인", "다음 추천 엔진 계산", "마지막 모델 추천"],
      helper: "메모리, CPU, GPU 정보를 읽은 뒤 현재 장치에 맞는 실행 엔진과 모델을 추천합니다.",
    };
  }

  return {
    title: `${specs.recommended_engine === "xllm" ? "가속 엔진 추천" : "CPU 엔진 추천"} · ${specs.recommended_model}`,
    badges: [
      formatMemoryLabel(specs.total_memory_gb, specs.available_memory_gb),
      formatGpuLabel(specs),
      `권장 ${specs.recommended_engine.toUpperCase()}`,
    ],
    helper: specs.recommendation_reason,
  };
}

export const useHardwareSpecs = () => {
  const [specs, setSpecs] = useState<HardwareSpecs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<HardwareSpecs>("get_hardware_specs")
      .then(setSpecs)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return { specs, loading, error };
};
