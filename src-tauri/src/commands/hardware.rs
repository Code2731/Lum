use crate::error::Result;
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct HardwareSpecs {
    /// 전체 RAM (GB)
    pub total_memory_gb: f32,
    /// 사용 가능한 RAM (GB)
    pub available_memory_gb: f32,
    /// CPU 코어 수
    pub cpu_cores: usize,
    /// GPU 종류: "discrete", "integrated", "none"
    pub gpu_type: String,
    /// wgpu 가속 지원 여부 (DiscreteGpu or IntegratedGpu)
    pub wgpu_supported: bool,
    /// GPU 이름 (감지된 경우)
    pub gpu_name: String,
    /// 추천 엔진: "xllm" | "cpu"
    pub recommended_engine: String,
    /// 추천 모델 ID (xLLM EXL2)
    pub recommended_model: String,
    /// 추천 이유
    pub recommendation_reason: String,
}

/// RAM + GPU 기반 xLLM EXL2 모델 추천 로직
///
/// EXL2 모델별 최소 VRAM 요구량 (4bpw 기준):
///  - 3B  : ~2.5 GB
///  - 7B  : ~4.5 GB
///  - 14B : ~8.5 GB
///  - 32B : ~19 GB
///
/// Discrete GPU는 최소 8GB VRAM을 가정 (최신 게이밍 GPU 기준).
/// Integrated GPU는 공유 RAM을 사용하므로 RAM 기준으로 판단.
fn recommend_model(total_memory_gb: f32, gpu_type: &str) -> (&'static str, &'static str) {
    match gpu_type {
        "discrete" => {
            // Discrete GPU: VRAM ≥ 8GB 가정
            // 더 정밀한 VRAM 감지가 필요하면 플랫폼별 API 사용 필요
            if total_memory_gb >= 32.0 {
                (
                    "Qwen2.5-Coder-14B-Instruct-EXL2-5bpw",
                    "Discrete GPU + 32GB RAM → 14B 5bpw (코딩 최적화, 고품질)",
                )
            } else {
                (
                    "Qwen2.5-Coder-7B-Instruct-EXL2-5bpw",
                    "Discrete GPU → 7B 5bpw (속도·품질 균형)",
                )
            }
        }
        "integrated" => {
            // Integrated GPU: RAM을 공유하므로 RAM 기준
            if total_memory_gb >= 32.0 {
                (
                    "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw",
                    "통합 GPU + 32GB RAM → 7B 4bpw (균형형)",
                )
            } else if total_memory_gb >= 16.0 {
                (
                    "Phi-3.5-mini-instruct-EXL2-4bpw",
                    "통합 GPU + 16GB RAM → 3.8B 4bpw (효율형)",
                )
            } else {
                (
                    "Qwen2.5-Coder-3B-Instruct-EXL2-4bpw",
                    "통합 GPU + 8GB RAM → 3B 4bpw (최소 사양)",
                )
            }
        }
        _ => {
            // GPU 없음: CPU 추론
            if total_memory_gb >= 32.0 {
                (
                    "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw",
                    "CPU + 32GB RAM → 7B 4bpw (CPU 추론 가능)",
                )
            } else if total_memory_gb >= 16.0 {
                (
                    "Phi-3.5-mini-instruct-EXL2-4bpw",
                    "CPU + 16GB RAM → 3.8B 4bpw (CPU 추론 권장)",
                )
            } else {
                (
                    "Qwen2.5-Coder-3B-Instruct-EXL2-4bpw",
                    "CPU + 8GB RAM → 3B 4bpw (최소 사양)",
                )
            }
        }
    }
}

#[command]
pub async fn get_hardware_specs() -> Result<HardwareSpecs> {
    // ── RAM 감지 ──────────────────────────────────────────────
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_bytes = sys.total_memory();
    let available_bytes = sys.available_memory();
    let total_memory_gb = total_bytes as f32 / 1024.0 / 1024.0 / 1024.0;
    let available_memory_gb = available_bytes as f32 / 1024.0 / 1024.0 / 1024.0;
    let cpu_cores = sys.cpus().len();

    // ── GPU 감지 (wgpu) ───────────────────────────────────────
    let instance = wgpu::Instance::default();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: None,
        })
        .await;

    let (gpu_type, wgpu_supported, gpu_name) = if let Some(adapter) = adapter {
        let info = adapter.get_info();
        let name = info.name.clone();
        let (gpu_type, supported) = match info.device_type {
            wgpu::DeviceType::DiscreteGpu => ("discrete", true),
            wgpu::DeviceType::IntegratedGpu => ("integrated", true),
            wgpu::DeviceType::VirtualGpu => ("integrated", true),
            _ => ("none", false),
        };
        (gpu_type.to_string(), supported, name)
    } else {
        ("none".to_string(), false, "Unknown".to_string())
    };

    // ── 모델 추천 ─────────────────────────────────────────────
    let (recommended_model, recommendation_reason) = recommend_model(total_memory_gb, &gpu_type);

    let recommended_engine = if wgpu_supported { "xllm" } else { "cpu" }.to_string();

    Ok(HardwareSpecs {
        total_memory_gb: (total_memory_gb * 10.0).round() / 10.0,
        available_memory_gb: (available_memory_gb * 10.0).round() / 10.0,
        cpu_cores,
        gpu_type,
        wgpu_supported,
        gpu_name,
        recommended_engine,
        recommended_model: recommended_model.to_string(),
        recommendation_reason: recommendation_reason.to_string(),
    })
}
