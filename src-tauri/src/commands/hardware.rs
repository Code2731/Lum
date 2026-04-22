use crate::error::Result;
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct HardwareSpecs {
    pub total_memory_gb: f32,
    pub available_memory_gb: f32,
    pub cpu_cores: usize,
    pub gpu_type: String,
    pub wgpu_supported: bool,
    pub gpu_name: String,
    pub recommended_engine: String,
    pub recommended_model: String,
    pub recommendation_reason: String,
}

// wgpu GPU 감지 — local-ai 피처 활성화 시
#[cfg(feature = "local-ai")]
async fn detect_gpu() -> (String, bool, String) {
    use wgpu::{DeviceType, Instance, RequestAdapterOptions, PowerPreference};
    let instance = Instance::default();
    let adapter = instance
        .request_adapter(&RequestAdapterOptions {
            power_preference: PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: None,
        })
        .await;

    if let Some(adapter) = adapter {
        let info = adapter.get_info();
        let name = info.name.clone();
        let (gpu_type, supported) = match info.device_type {
            DeviceType::DiscreteGpu => ("discrete", true),
            DeviceType::IntegratedGpu | DeviceType::VirtualGpu => ("integrated", true),
            _ => ("none", false),
        };
        (gpu_type.to_string(), supported, name)
    } else {
        ("none".to_string(), false, String::new())
    }
}

// local-ai 없는 기본 빌드: GPU 감지 생략
#[cfg(not(feature = "local-ai"))]
async fn detect_gpu() -> (String, bool, String) {
    ("none".to_string(), false, String::new())
}

/// RAM + GPU 기반 xLLM EXL2 모델 추천
fn recommend_model(total_memory_gb: f32, gpu_type: &str) -> (&'static str, &'static str) {
    match gpu_type {
        "discrete" => {
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
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_memory_gb = sys.total_memory() as f32 / 1024.0 / 1024.0 / 1024.0;
    let available_memory_gb = sys.available_memory() as f32 / 1024.0 / 1024.0 / 1024.0;
    let cpu_cores = sys.cpus().len();

    let (gpu_type, wgpu_supported, gpu_name) = detect_gpu().await;
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
