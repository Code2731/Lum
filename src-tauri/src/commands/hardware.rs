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
    pub gpu_vram_gb: Option<f32>, // Windows 전용 GPU VRAM
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

// Windows: nvidia-smi → wmic 순으로 GPU VRAM 감지
#[cfg(windows)]
fn get_gpu_vram_gb() -> Option<f32> {
    // NVIDIA: nvidia-smi (MB 단위, 가장 정확)
    if let Ok(out) = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=memory.total", "--format=csv,noheader,nounits"])
        .output()
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            if let Ok(mb) = s.trim().lines().next().unwrap_or("").trim().parse::<f32>() {
                return Some((mb / 1024.0 * 10.0).round() / 10.0);
            }
        }
    }
    // 폴백: wmic (bytes 단위)
    if let Ok(out) = std::process::Command::new("wmic")
        .args(["path", "Win32_VideoController", "get", "AdapterRAM", "/format:list"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            if let Some(val) = line.trim().strip_prefix("AdapterRAM=") {
                if let Ok(bytes) = val.trim().parse::<u64>() {
                    if bytes > 0 {
                        let gb = bytes as f32 / 1024.0 / 1024.0 / 1024.0;
                        return Some((gb * 10.0).round() / 10.0);
                    }
                }
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn get_gpu_vram_gb() -> Option<f32> {
    None // macOS 통합 메모리 → total_memory_gb 사용
}

/// RAM/VRAM + GPU 기반 xLLM EXL2 모델 추천
fn recommend_model(total_memory_gb: f32, gpu_type: &str, gpu_vram_gb: Option<f32>) -> (&'static str, &'static str) {
    // Windows discrete GPU: VRAM 기준 추천, Mac/기타: 통합 메모리(RAM) 기준
    let memory_gb = if gpu_type == "discrete" {
        gpu_vram_gb.unwrap_or(total_memory_gb)
    } else {
        total_memory_gb
    };
    match gpu_type {
        "discrete" => {
            if memory_gb >= 24.0 {
                (
                    "Qwen2.5-Coder-14B-Instruct-EXL2-5bpw",
                    "외장 GPU 24GB+ VRAM → 14B 5bpw (코딩 최적화, 고품질)",
                )
            } else if memory_gb >= 10.0 {
                (
                    "Qwen2.5-Coder-7B-Instruct-EXL2-5bpw",
                    "외장 GPU 10GB+ VRAM → 7B 5bpw (속도·품질 균형)",
                )
            } else {
                (
                    "Qwen2.5-Coder-3B-Instruct-EXL2-4bpw",
                    "외장 GPU 8GB VRAM → 3B 4bpw (최소 VRAM 최적화)",
                )
            }
        }
        "integrated" => {
            if memory_gb >= 32.0 {
                (
                    "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw",
                    "통합 GPU + 32GB 통합 메모리 → 7B 4bpw (균형형)",
                )
            } else if memory_gb >= 16.0 {
                (
                    "Phi-3.5-mini-instruct-EXL2-4bpw",
                    "통합 GPU + 16GB 통합 메모리 → 3.8B 4bpw (효율형)",
                )
            } else {
                (
                    "Qwen2.5-Coder-3B-Instruct-EXL2-4bpw",
                    "통합 GPU + 8GB 통합 메모리 → 3B 4bpw (최소 사양)",
                )
            }
        }
        _ => {
            if memory_gb >= 32.0 {
                (
                    "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw",
                    "CPU + 32GB RAM → 7B 4bpw (CPU 추론 가능)",
                )
            } else if memory_gb >= 16.0 {
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
    let gpu_vram_gb = get_gpu_vram_gb();
    let (recommended_model, recommendation_reason) = recommend_model(total_memory_gb, &gpu_type, gpu_vram_gb);
    let recommended_engine = if wgpu_supported { "xllm" } else { "cpu" }.to_string();

    Ok(HardwareSpecs {
        total_memory_gb: (total_memory_gb * 10.0).round() / 10.0,
        available_memory_gb: (available_memory_gb * 10.0).round() / 10.0,
        cpu_cores,
        gpu_type,
        wgpu_supported,
        gpu_name,
        gpu_vram_gb,
        recommended_engine,
        recommended_model: recommended_model.to_string(),
        recommendation_reason: recommendation_reason.to_string(),
    })
}
