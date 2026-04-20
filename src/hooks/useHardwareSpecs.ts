import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface HardwareSpecs {
  total_memory_gb: number;
  available_memory_gb: number;
  cpu_cores: number;
  gpu_type: "discrete" | "integrated" | "none";
  wgpu_supported: boolean;
  gpu_name: string;
  recommended_engine: "xllm" | "cpu";
  recommended_model: string;
  recommendation_reason: string;
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
