use crate::error::Result;
use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{ProcessesToUpdate, System};
use tauri::{command, State};

const BYTES_PER_GB: f64 = 1_073_741_824.0;
const BYTES_PER_MB: f64 = 1_048_576.0;

pub struct SysmonState {
    pub sys: Mutex<System>,
}

impl SysmonState {
    pub fn new() -> Self {
        Self { sys: Mutex::new(System::new_all()) }
    }
}

#[derive(Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_mb: f64,
}

#[derive(Serialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub memory_used_gb: f64,
    pub memory_total_gb: f64,
    pub memory_percent: f32,
    pub cpu_count: usize,
    pub top_cpu: Vec<ProcessInfo>,
    pub top_mem: Vec<ProcessInfo>,
}

#[command]
pub fn get_system_stats(state: State<SysmonState>) -> Result<SystemStats> {
    // 데이터 수집 후 즉시 lock 해제 — 정렬은 lock 범위 밖에서 수행
    let (cpu_usage, memory_used_gb, memory_total_gb, cpu_count, procs) = {
        let mut sys = state.sys.lock().unwrap();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        sys.refresh_processes(ProcessesToUpdate::All, false);

        let procs: Vec<ProcessInfo> = sys
            .processes()
            .values()
            .map(|p| ProcessInfo {
                pid: p.pid().as_u32(),
                name: p.name().to_string_lossy().to_string(),
                cpu_percent: p.cpu_usage(),
                memory_mb: p.memory() as f64 / BYTES_PER_MB,
            })
            .collect();

        (
            sys.global_cpu_usage(),
            sys.used_memory() as f64 / BYTES_PER_GB,
            sys.total_memory() as f64 / BYTES_PER_GB,
            sys.cpus().len(),
            procs,
        )
    };

    let memory_percent = if memory_total_gb > 0.0 {
        (memory_used_gb / memory_total_gb * 100.0) as f32
    } else {
        0.0
    };

    // 한 번 수집된 Vec을 clone해서 각각 정렬 (이중 수집 제거)
    let mut top_cpu = procs.clone();
    top_cpu.sort_by(|a, b| b.cpu_percent.partial_cmp(&a.cpu_percent).unwrap_or(std::cmp::Ordering::Equal));
    top_cpu.truncate(6);

    let mut top_mem = procs;
    top_mem.sort_by(|a, b| b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal));
    top_mem.truncate(6);

    Ok(SystemStats {
        cpu_usage,
        memory_used_gb: (memory_used_gb * 10.0).round() / 10.0,
        memory_total_gb: (memory_total_gb * 10.0).round() / 10.0,
        memory_percent,
        cpu_count,
        top_cpu,
        top_mem,
    })
}
