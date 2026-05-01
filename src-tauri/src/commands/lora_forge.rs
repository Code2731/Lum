// Phase 119 — LoRA Forge.
// Phase 117 → 118 → 119로 이어지는 학습 루프의 마지막 고리:
// "내 데이터로 내 모델을 학습한다" 를 클릭 한 번에. 클라우드 제품은 데이터 보관정책상 못 함.
//
// 외부 CLI(`mlx_lm`/`axolotl`)를 서브프로세스로 호출 — LUM은 오케스트레이션만 담당.
// 영속: ~/.lum_lora_runs.json (Vec<ForgeRun>) + ~/.lum_lora_runs/<id>/ 출력 디렉터리.
// 진행률은 tauri 이벤트 `lora_forge_progress` / `lora_forge_status` 로 emit.

use crate::error::{LumError, Result};
use crate::platform;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::oneshot;

const MAX_LOG_TAIL: usize = 80;

fn runs_dir() -> PathBuf {
    platform::home_dir().join(".lum_lora_runs")
}

fn runs_index_path() -> PathBuf {
    platform::home_dir().join(".lum_lora_runs.json")
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ForgeStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ForgeRun {
    pub id: String,
    pub task: String,
    pub runtime: String, // "mlx-lm" | "axolotl"
    pub base_model: String,
    pub dataset_path: String,
    pub output_dir: String,
    pub iters: u32,
    pub lora_rank: u32,
    pub learning_rate: f32,
    pub ts_started_ms: u64,
    pub ts_ended_ms: Option<u64>,
    pub status: ForgeStatus,
    pub exit_code: Option<i32>,
    /// 마지막 N줄. 진행 중에는 빈 배열 — 라이브 로그는 이벤트로 stream, finalize 시 채움.
    pub log_tail: Vec<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct ForgeStore {
    runs: Vec<ForgeRun>,
}

fn load_store() -> ForgeStore {
    std::fs::read_to_string(runs_index_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_store(store: &ForgeStore) -> Result<()> {
    let json = serde_json::to_string_pretty(store).map_err(|e| LumError::Io(e.to_string()))?;
    std::fs::write(runs_index_path(), json).map_err(|e| LumError::Io(e.to_string()))?;
    Ok(())
}

// ── In-memory state: cancel 채널 + live log buffer ──────────────────────

struct Cancels(Mutex<HashMap<String, oneshot::Sender<()>>>);
fn cancels() -> &'static Cancels {
    static C: OnceLock<Cancels> = OnceLock::new();
    C.get_or_init(|| Cancels(Mutex::new(HashMap::new())))
}

struct LogBuffers(Mutex<HashMap<String, VecDeque<String>>>);
fn logs() -> &'static LogBuffers {
    static L: OnceLock<LogBuffers> = OnceLock::new();
    L.get_or_init(|| LogBuffers(Mutex::new(HashMap::new())))
}

fn push_log_line(run_id: &str, line: &str) {
    let mut map = logs().0.lock().unwrap();
    let buf = map.entry(run_id.to_string()).or_default();
    buf.push_back(line.to_string());
    while buf.len() > MAX_LOG_TAIL {
        buf.pop_front();
    }
}

fn drain_log(run_id: &str) -> Vec<String> {
    logs()
        .0
        .lock()
        .unwrap()
        .remove(run_id)
        .map(|d| d.into_iter().collect())
        .unwrap_or_default()
}

// ── Runtime 감지 ─────────────────────────────────────────────────────────

fn python_bin() -> &'static str {
    if cfg!(windows) {
        "python"
    } else {
        "python3"
    }
}

async fn detect_python_module(module: &str) -> bool {
    TokioCommand::new(python_bin())
        .args(["-c", &format!("import {module}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

#[derive(Serialize)]
pub struct RuntimeStatus {
    pub mlx_lm: bool,
    pub axolotl: bool,
    /// 사용자가 읽을 수 있는 안내. UI는 이걸 그대로 출력.
    pub hint: String,
}

#[tauri::command]
pub async fn lora_forge_runtimes() -> RuntimeStatus {
    let (mlx, axo) = tokio::join!(detect_python_module("mlx_lm"), detect_python_module("axolotl"));
    let hint = match (mlx, axo) {
        (true, _) => "mlx_lm 감지됨 (Apple Silicon 권장)".to_string(),
        (false, true) => "axolotl 감지됨 (CUDA)".to_string(),
        (false, false) => {
            "학습 런타임 미설치 — pip install mlx-lm  (macOS) 또는  pip install axolotl  (CUDA)".to_string()
        }
    };
    RuntimeStatus {
        mlx_lm: mlx,
        axolotl: axo,
        hint,
    }
}

// ── 핵심: start / cancel / list / remove / load ─────────────────────────

#[derive(Deserialize)]
pub struct ForgeOptions {
    pub task: String,
    pub runtime: String,
    pub base_model: String,
    /// None이면 healing chatml export를 자동 실행하고 그 파일을 사용.
    pub dataset_path: Option<String>,
    pub iters: u32,
    pub lora_rank: u32,
    pub learning_rate: f32,
}

fn validate_opts(opts: &ForgeOptions) -> Result<()> {
    if opts.task.trim().is_empty() {
        return Err(LumError::Io("task 설명이 비어있습니다".into()));
    }
    if opts.runtime != "mlx-lm" && opts.runtime != "axolotl" {
        return Err(LumError::Io(format!(
            "지원하지 않는 runtime: {} (mlx-lm | axolotl)",
            opts.runtime
        )));
    }
    if opts.base_model.trim().is_empty() {
        return Err(LumError::Io("base_model 경로/ID가 비어있습니다".into()));
    }
    if !(1..=10_000).contains(&opts.iters) {
        return Err(LumError::Io("iters는 1..=10000 범위여야 합니다".into()));
    }
    if !(2..=64).contains(&opts.lora_rank) {
        return Err(LumError::Io("lora_rank는 2..=64 범위여야 합니다".into()));
    }
    if !(opts.learning_rate.is_finite() && opts.learning_rate > 0.0 && opts.learning_rate < 1.0) {
        return Err(LumError::Io("learning_rate는 (0, 1) 범위 유한값이어야 합니다".into()));
    }
    Ok(())
}

fn make_run_id() -> String {
    format!("lora-{}", now_ms())
}

#[tauri::command]
pub async fn lora_forge_start(app: AppHandle, opts: ForgeOptions) -> Result<ForgeRun> {
    validate_opts(&opts)?;

    // 데이터셋 경로 결정 — 명시되지 않으면 healing chatml을 자동 export.
    let dataset_path = match opts.dataset_path.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        Some(p) => PathBuf::from(p),
        None => {
            let (count, path_str) =
                crate::commands::healing_dataset::export_healing_dataset("chatml".into(), None)?;
            if count == 0 {
                return Err(LumError::Io(
                    "approve된 healing record가 없습니다 — 자동치유 제안을 몇 번 승인한 뒤 다시 시도하세요".into(),
                ));
            }
            PathBuf::from(path_str)
        }
    };

    if !dataset_path.exists() {
        return Err(LumError::Io(format!(
            "dataset 파일이 존재하지 않습니다: {}",
            dataset_path.display()
        )));
    }

    let id = make_run_id();
    std::fs::create_dir_all(runs_dir()).map_err(|e| LumError::Io(format!("runs 디렉터리 생성 실패: {e}")))?;
    let output_dir = runs_dir().join(&id);
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| LumError::Io(format!("output_dir 생성 실패: {e}")))?;

    let run = ForgeRun {
        id: id.clone(),
        task: opts.task.trim().to_string(),
        runtime: opts.runtime.clone(),
        base_model: opts.base_model.trim().to_string(),
        dataset_path: dataset_path.to_string_lossy().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        iters: opts.iters,
        lora_rank: opts.lora_rank,
        learning_rate: opts.learning_rate,
        ts_started_ms: now_ms(),
        ts_ended_ms: None,
        status: ForgeStatus::Running,
        exit_code: None,
        log_tail: Vec::new(),
    };

    // 영속(상위에 insert) — UI가 즉시 새 run을 표시.
    let mut store = load_store();
    store.runs.insert(0, run.clone());
    save_store(&store)?;

    spawn_training(app, run.clone())?;
    Ok(run)
}

fn build_command(run: &ForgeRun) -> Result<TokioCommand> {
    let mut cmd = TokioCommand::new(python_bin());
    match run.runtime.as_str() {
        "mlx-lm" => {
            cmd.args([
                "-m",
                "mlx_lm",
                "lora",
                "--model",
                &run.base_model,
                "--train",
                "--data",
                &run.dataset_path,
                "--iters",
                &run.iters.to_string(),
                "--batch-size",
                "1",
                "--lora-rank",
                &run.lora_rank.to_string(),
                "--learning-rate",
                &format!("{:e}", run.learning_rate),
                "--adapter-path",
                &run.output_dir,
            ]);
        }
        "axolotl" => {
            let yaml_path = std::path::Path::new(&run.output_dir).join("config.yaml");
            std::fs::write(&yaml_path, build_axolotl_yaml(run))
                .map_err(|e| LumError::Io(format!("axolotl config.yaml 쓰기 실패: {e}")))?;
            cmd.args(["-m", "axolotl.cli.train", &yaml_path.to_string_lossy()]);
        }
        other => return Err(LumError::Io(format!("지원하지 않는 runtime: {other}"))),
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    Ok(cmd)
}

/// axolotl 기본 yaml 템플릿. 사용자가 원하면 출력 디렉터리에서 직접 편집해 재실행 가능.
/// chat_template=chatml로 healing export 형식과 직접 호환.
fn build_axolotl_yaml(run: &ForgeRun) -> String {
    format!(
        r#"# LUM LoRA Forge — auto-generated. 이 파일을 편집하면 다음 실행에 반영됩니다.
base_model: {base}
load_in_8bit: false
load_in_4bit: false
strict: false

datasets:
  - path: {dataset}
    type: chat_template
    chat_template: chatml

dataset_prepared_path:
val_set_size: 0
output_dir: {out}

adapter: lora
lora_r: {rank}
lora_alpha: {alpha}
lora_dropout: 0.05
lora_target_modules:
  - q_proj
  - v_proj
  - k_proj
  - o_proj

sequence_len: 2048
sample_packing: false
pad_to_sequence_len: false

gradient_accumulation_steps: 4
micro_batch_size: 1
max_steps: {iters}
optimizer: adamw_torch
lr_scheduler: cosine
learning_rate: {lr}

bf16: auto
fp16:
tf32: false

logging_steps: 1
warmup_ratio: 0.05
saves_per_epoch: 1
"#,
        base = run.base_model,
        dataset = run.dataset_path,
        out = run.output_dir,
        rank = run.lora_rank,
        alpha = run.lora_rank * 2,
        iters = run.iters,
        lr = run.learning_rate,
    )
}

fn spawn_training(app: AppHandle, run: ForgeRun) -> Result<()> {
    let mut cmd = build_command(&run)?;
    let mut child = cmd
        .spawn()
        .map_err(|e| LumError::Io(format!("학습 프로세스 spawn 실패: {e}")))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| LumError::Io("stdout 캡처 실패".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| LumError::Io("stderr 캡처 실패".into()))?;

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    cancels().0.lock().unwrap().insert(run.id.clone(), cancel_tx);

    // stdout 스트림.
    let app_o = app.clone();
    let id_o = run.id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            push_log_line(&id_o, &line);
            let _ = app_o.emit(
                "lora_forge_progress",
                serde_json::json!({
                    "run_id": id_o,
                    "stream": "stdout",
                    "line": line,
                    "ts_ms": now_ms(),
                }),
            );
        }
    });
    // stderr 스트림 — 학습 도구 대부분이 진행률을 stderr에 출력.
    let app_e = app.clone();
    let id_e = run.id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            push_log_line(&id_e, &line);
            let _ = app_e.emit(
                "lora_forge_progress",
                serde_json::json!({
                    "run_id": id_e,
                    "stream": "stderr",
                    "line": line,
                    "ts_ms": now_ms(),
                }),
            );
        }
    });

    // 메인 감시 — wait vs cancel race.
    let app_w = app;
    let id_w = run.id;
    tokio::spawn(async move {
        let cancelled;
        let exit_code;
        tokio::select! {
            res = child.wait() => {
                cancelled = false;
                exit_code = res.ok().and_then(|s| s.code());
            }
            _ = cancel_rx => {
                cancelled = true;
                let _ = child.start_kill();
                let _ = child.wait().await;
                exit_code = None;
            }
        }
        cancels().0.lock().unwrap().remove(&id_w);

        let final_status = if cancelled {
            ForgeStatus::Cancelled
        } else if matches!(exit_code, Some(0)) {
            ForgeStatus::Completed
        } else {
            ForgeStatus::Failed
        };
        finalize_run(&id_w, final_status.clone(), exit_code);

        let _ = app_w.emit(
            "lora_forge_status",
            serde_json::json!({
                "run_id": id_w,
                "status": final_status,
                "exit_code": exit_code,
                "ts_ms": now_ms(),
            }),
        );
    });

    Ok(())
}

fn finalize_run(run_id: &str, status: ForgeStatus, exit_code: Option<i32>) {
    let tail = drain_log(run_id);
    let mut store = load_store();
    if let Some(r) = store.runs.iter_mut().find(|r| r.id == run_id) {
        r.status = status;
        r.exit_code = exit_code;
        r.ts_ended_ms = Some(now_ms());
        r.log_tail = tail;
    }
    let _ = save_store(&store);
}

#[tauri::command]
pub fn lora_forge_cancel(run_id: String) -> Result<bool> {
    let tx = cancels().0.lock().unwrap().remove(&run_id);
    Ok(tx.map(|t| t.send(()).is_ok()).unwrap_or(false))
}

#[tauri::command]
pub fn lora_forge_list() -> Result<Vec<ForgeRun>> {
    Ok(load_store().runs)
}

#[tauri::command]
pub fn lora_forge_remove(run_id: String) -> Result<()> {
    // 실행 중이면 먼저 취소.
    if let Some(tx) = cancels().0.lock().unwrap().remove(&run_id) {
        let _ = tx.send(());
    }
    let mut store = load_store();
    let before = store.runs.len();
    store.runs.retain(|r| r.id != run_id);
    if store.runs.len() == before {
        return Err(LumError::Io(format!("run을 찾을 수 없습니다: {run_id}")));
    }
    save_store(&store)?;
    let _ = std::fs::remove_dir_all(runs_dir().join(&run_id));
    Ok(())
}

/// 출력 디렉터리에 `adapter_config.json`이 있으면 mistralrs LoRA 로더와 호환.
#[tauri::command]
pub fn lora_forge_can_load(run_id: String) -> Result<bool> {
    let store = load_store();
    let run = store
        .runs
        .iter()
        .find(|r| r.id == run_id)
        .ok_or_else(|| LumError::Io(format!("run을 찾을 수 없습니다: {run_id}")))?;
    if run.status != ForgeStatus::Completed {
        return Ok(false);
    }
    let path = std::path::Path::new(&run.output_dir).join("adapter_config.json");
    Ok(path.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> ForgeOptions {
        ForgeOptions {
            task: "test".into(),
            runtime: "mlx-lm".into(),
            base_model: "mlx-community/Qwen2.5-Coder-7B-Instruct-bf16".into(),
            dataset_path: Some("/tmp/x.jsonl".into()),
            iters: 100,
            lora_rank: 8,
            learning_rate: 1e-5,
        }
    }

    #[test]
    fn validate_accepts_sane_opts() {
        validate_opts(&opts()).unwrap();
    }

    #[test]
    fn validate_rejects_empty_task() {
        let mut o = opts();
        o.task = "  ".into();
        assert!(validate_opts(&o).is_err());
    }

    #[test]
    fn validate_rejects_unknown_runtime() {
        let mut o = opts();
        o.runtime = "qlora".into();
        assert!(validate_opts(&o).is_err());
    }

    #[test]
    fn validate_rejects_bad_iters() {
        let mut o = opts();
        o.iters = 0;
        assert!(validate_opts(&o).is_err());
        o.iters = 100_000;
        assert!(validate_opts(&o).is_err());
    }

    #[test]
    fn validate_rejects_bad_rank() {
        let mut o = opts();
        o.lora_rank = 1;
        assert!(validate_opts(&o).is_err());
        o.lora_rank = 128;
        assert!(validate_opts(&o).is_err());
    }

    #[test]
    fn validate_rejects_bad_lr() {
        let mut o = opts();
        o.learning_rate = 0.0;
        assert!(validate_opts(&o).is_err());
        o.learning_rate = 1.5;
        assert!(validate_opts(&o).is_err());
        o.learning_rate = f32::NAN;
        assert!(validate_opts(&o).is_err());
    }

    #[test]
    fn run_id_has_lora_prefix_and_unique() {
        let a = make_run_id();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let b = make_run_id();
        assert!(a.starts_with("lora-"));
        assert!(b.starts_with("lora-"));
        assert_ne!(a, b);
    }

    #[test]
    fn axolotl_yaml_includes_dataset_path() {
        let run = ForgeRun {
            id: "lora-1".into(),
            task: "t".into(),
            runtime: "axolotl".into(),
            base_model: "Qwen/Qwen2.5-Coder-7B-Instruct".into(),
            dataset_path: "/abs/data.jsonl".into(),
            output_dir: "/abs/out".into(),
            iters: 200,
            lora_rank: 8,
            learning_rate: 1e-5,
            ts_started_ms: 0,
            ts_ended_ms: None,
            status: ForgeStatus::Running,
            exit_code: None,
            log_tail: Vec::new(),
        };
        let y = build_axolotl_yaml(&run);
        assert!(y.contains("/abs/data.jsonl"));
        assert!(y.contains("/abs/out"));
        assert!(y.contains("max_steps: 200"));
        assert!(y.contains("lora_r: 8"));
        // alpha = rank * 2
        assert!(y.contains("lora_alpha: 16"));
        assert!(y.contains("chat_template: chatml"));
    }

    #[test]
    fn log_buffer_truncates_to_max() {
        let id = "test-log-trunc";
        for i in 0..MAX_LOG_TAIL + 50 {
            push_log_line(id, &format!("line {i}"));
        }
        let drained = drain_log(id);
        assert_eq!(drained.len(), MAX_LOG_TAIL);
        // 가장 오래된 줄(0..49)이 빠지고 마지막 MAX_LOG_TAIL개만 남아야 함.
        assert!(drained.first().unwrap().contains("line 50"));
    }

    #[test]
    fn forge_run_round_trip_serde() {
        let r = ForgeRun {
            id: "x".into(),
            task: "t".into(),
            runtime: "mlx-lm".into(),
            base_model: "b".into(),
            dataset_path: "d".into(),
            output_dir: "o".into(),
            iters: 10,
            lora_rank: 8,
            learning_rate: 1e-5,
            ts_started_ms: 1,
            ts_ended_ms: Some(2),
            status: ForgeStatus::Completed,
            exit_code: Some(0),
            log_tail: vec!["a".into()],
        };
        let j = serde_json::to_string(&r).unwrap();
        let back: ForgeRun = serde_json::from_str(&j).unwrap();
        assert_eq!(back.status, ForgeStatus::Completed);
        assert_eq!(back.exit_code, Some(0));
        assert!(j.contains("\"completed\""));
    }
}
