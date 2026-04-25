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
    use wgpu::{DeviceType, Instance, PowerPreference, RequestAdapterOptions};
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

// NVML 우선 (Windows/Linux) → nvidia-smi → wmic 폴백
#[cfg(not(target_os = "macos"))]
pub fn get_gpu_vram_gb() -> Option<f32> {
    // 1. NVML 직접 바인딩 (가장 정확, ~1ms)
    if let Some(gb) = get_vram_via_nvml() {
        return Some(gb);
    }
    // 2. nvidia-smi (fork 비용)
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
    // 3. wmic (Windows 전용 폴백, AMD/Intel도 감지) — Windows 11 25H2부터 deprecated
    #[cfg(windows)]
    if let Ok(out) = std::process::Command::new("wmic")
        .args([
            "path",
            "Win32_VideoController",
            "get",
            "AdapterRAM",
            "/format:list",
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        let mut max_bytes: u64 = 0;
        for line in s.lines() {
            if let Some(val) = line.trim().strip_prefix("AdapterRAM=") {
                if let Ok(bytes) = val.trim().parse::<u64>() {
                    if bytes > max_bytes { max_bytes = bytes; }
                }
            }
        }
        if max_bytes > 0 {
            let gb = max_bytes as f32 / 1024.0 / 1024.0 / 1024.0;
            return Some((gb * 10.0).round() / 10.0);
        }
    }
    // 4. PowerShell registry — qwMemorySize는 REG_QWORD(64-bit)로 4GB 이상 정확.
    //    wmic/Get-CimInstance의 AdapterRAM(32-bit DWORD)은 4GB 제한이 있어 RTX 3080 10GB가 4GB로 잘려나옴.
    #[cfg(windows)]
    if let Ok(out) = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\*' -Name 'HardwareInformation.qwMemorySize' -ErrorAction SilentlyContinue | ForEach-Object { $_.'HardwareInformation.qwMemorySize' } | Sort-Object -Descending | Select-Object -First 1",
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Ok(bytes) = s.trim().parse::<u64>() {
            if bytes > 0 {
                let gb = bytes as f32 / 1024.0 / 1024.0 / 1024.0;
                return Some((gb * 10.0).round() / 10.0);
            }
        }
    }
    // 5. PowerShell Get-CimInstance — 32-bit AdapterRAM 폴백 (wmic 미설치 환경)
    #[cfg(windows)]
    if let Ok(out) = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_VideoController | Where-Object {$_.AdapterRAM -gt 0} | Sort-Object AdapterRAM -Descending | Select-Object -First 1).AdapterRAM",
        ])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Ok(bytes) = s.trim().parse::<u64>() {
            if bytes > 0 {
                let gb = bytes as f32 / 1024.0 / 1024.0 / 1024.0;
                return Some((gb * 10.0).round() / 10.0);
            }
        }
    }
    None
}

/// NVML(NVIDIA Management Library)로 VRAM 직접 조회.
/// nvidia-smi fork보다 빠르고, CUDA 설치 필요 없이 드라이버만으로 작동.
#[cfg(not(target_os = "macos"))]
fn get_vram_via_nvml() -> Option<f32> {
    use nvml_wrapper::Nvml;
    let nvml = Nvml::init().ok()?;
    let count = nvml.device_count().ok()?;
    if count == 0 {
        return None;
    }
    // 첫 GPU만 사용 (멀티 GPU는 드물고, 모델 로드는 보통 단일 GPU)
    let device = nvml.device_by_index(0).ok()?;
    let mem = device.memory_info().ok()?;
    let gb = mem.total as f32 / 1024.0 / 1024.0 / 1024.0;
    Some((gb * 10.0).round() / 10.0)
}

#[cfg(target_os = "macos")]
pub fn get_gpu_vram_gb() -> Option<f32> {
    None // macOS 통합 메모리 → total_memory_gb 사용
}

/// TabbyAPI config 생성용 — macOS는 시스템 RAM 반환 (통합 메모리),
/// Windows/Linux는 NVIDIA VRAM.
pub fn get_vram_gb() -> Option<f32> {
    get_gpu_vram_gb().or_else(|| {
        // macOS fallback: sysinfo 총 RAM의 70% (통합 메모리에서 OS·앱 여유분)
        #[cfg(target_os = "macos")]
        {
            use sysinfo::System;
            let mut sys = System::new();
            sys.refresh_memory();
            let total_gb = sys.total_memory() as f32 / 1024.0 / 1024.0 / 1024.0;
            Some((total_gb * 0.7 * 10.0).round() / 10.0)
        }
        #[cfg(not(target_os = "macos"))]
        None
    })
}

/// RAM/VRAM + GPU 기반 xLLM EXL2 모델 추천
fn recommend_model(
    total_memory_gb: f32,
    gpu_type: &str,
    gpu_vram_gb: Option<f32>,
) -> (&'static str, &'static str) {
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
    let (recommended_model, recommendation_reason) =
        recommend_model(total_memory_gb, &gpu_type, gpu_vram_gb);
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
