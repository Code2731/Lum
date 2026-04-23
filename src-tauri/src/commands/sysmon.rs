use crate::error::Result;
use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{ProcessesToUpdate, System};
use tauri::{command, State};

pub struct SysmonState {
    pub sys: Mutex<System>,
}

impl SysmonState {
    pub fn new() -> Self {
        Self { sys: Mutex::new(System::new_all()) }
    }
}

#[derive(Serialize)]
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
    let mut sys = state.sys.lock().unwrap();

    sys.refresh_cpu_usage();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, false);

    let cpu_usage = sys.global_cpu_usage();
    let memory_used_gb = sys.used_memory() as f64 / 1_073_741_824.0;
    let memory_total_gb = sys.total_memory() as f64 / 1_073_741_824.0;
    let memory_percent = if memory_total_gb > 0.0 {
        (memory_used_gb / memory_total_gb * 100.0) as f32
    } else {
        0.0
    };
    let cpu_count = sys.cpus().len();

    let mut procs: Vec<ProcessInfo> = sys
        .processes()
        .values()
        .map(|p| ProcessInfo {
            pid: p.pid().as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cpu_percent: p.cpu_usage(),
            memory_mb: p.memory() as f64 / 1_048_576.0,
        })
        .collect();

    procs.sort_by(|a, b| {
        b.cpu_percent.partial_cmp(&a.cpu_percent).unwrap_or(std::cmp::Ordering::Equal)
    });
    let top_cpu: Vec<ProcessInfo> = procs.drain(..procs.len().min(6)).collect();

    let mut procs2: Vec<ProcessInfo> = sys
        .processes()
        .values()
        .map(|p| ProcessInfo {
            pid: p.pid().as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cpu_percent: p.cpu_usage(),
            memory_mb: p.memory() as f64 / 1_048_576.0,
        })
        .collect();

    procs2.sort_by(|a, b| {
        b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal)
    });
    let top_mem: Vec<ProcessInfo> = procs2.drain(..procs2.len().min(6)).collect();

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
