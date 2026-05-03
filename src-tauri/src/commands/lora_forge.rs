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

const SUPPORTED_RUNTIMES: &[&str] = &["mlx-lm", "axolotl"];

pub fn is_supported_runtime(rt: &str) -> bool {
    SUPPORTED_RUNTIMES.contains(&rt)
}

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
    /// Phase 120: 자동 학습으로 시작된 run인지. UI에서 배지로 구분.
    #[serde(default)]
    pub auto: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct ForgeStore {
    runs: Vec<ForgeRun>,
    /// Phase 120: 마지막 성공한 자동 학습이 학습한 데이터 cutoff(ms).
    /// 이 ts_ms보다 큰 approve record만 미학습으로 카운트.
    #[serde(default)]
    auto_train_cursor_ms: u64,
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

/// 패닉으로 poison된 락도 회복 — Mutex가 보호하는 데이터는 단순 HashMap 뿐이라
/// 부분 갱신으로 인한 invariant 깨짐 위험 없음.
fn lock_cancels() -> std::sync::MutexGuard<'static, HashMap<String, oneshot::Sender<()>>> {
    cancels().0.lock().unwrap_or_else(|p| p.into_inner())
}

struct LogBuffers(Mutex<HashMap<String, VecDeque<String>>>);
fn logs() -> &'static LogBuffers {
    static L: OnceLock<LogBuffers> = OnceLock::new();
    L.get_or_init(|| LogBuffers(Mutex::new(HashMap::new())))
}

fn lock_logs() -> std::sync::MutexGuard<'static, HashMap<String, VecDeque<String>>> {
    logs().0.lock().unwrap_or_else(|p| p.into_inner())
}

fn push_log_line(run_id: &str, line: &str) {
    let mut map = lock_logs();
    let buf = map.entry(run_id.to_string()).or_default();
    buf.push_back(line.to_string());
    while buf.len() > MAX_LOG_TAIL {
        buf.pop_front();
    }
}

fn drain_log(run_id: &str) -> Vec<String> {
    lock_logs()
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
    let (mlx, axo) = tokio::join!(
        detect_python_module("mlx_lm"),
        detect_python_module("axolotl")
    );
    let hint = match (mlx, axo) {
        (true, _) => "mlx_lm 감지됨 (Apple Silicon 권장)".to_string(),
        (false, true) => "axolotl 감지됨 (CUDA)".to_string(),
        (false, false) => {
            "학습 런타임 미설치 — pip install mlx-lm  (macOS) 또는  pip install axolotl  (CUDA)"
                .to_string()
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
    if !is_supported_runtime(&opts.runtime) {
        return Err(LumError::Io(format!(
            "지원하지 않는 runtime: {} ({})",
            opts.runtime,
            SUPPORTED_RUNTIMES.join(" | "),
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
        return Err(LumError::Io(
            "learning_rate는 (0, 1) 범위 유한값이어야 합니다".into(),
        ));
    }
    Ok(())
}

fn make_run_id() -> String {
    format!("lora-{}", now_ms())
}

/// 자동 학습용 후처리 옵션. user-initiated run은 None.
#[derive(Clone, Default)]
struct AutoMode {
    /// 학습 성공 시 이 cursor로 auto_train_cursor_ms 갱신.
    cursor_candidate_ms: u64,
    /// 호환되면 학습 성공 시 embed_load_lora 자동 호출.
    auto_load: bool,
}

#[tauri::command]
pub async fn lora_forge_start(app: AppHandle, opts: ForgeOptions) -> Result<ForgeRun> {
    start_internal(app, opts, None).await
}

/// auto_mode가 Some이면 자동 학습으로 spawn된 run.
async fn start_internal(
    app: AppHandle,
    opts: ForgeOptions,
    auto_mode: Option<AutoMode>,
) -> Result<ForgeRun> {
    validate_opts(&opts)?;

    // 데이터셋 경로 결정 — 명시되지 않으면 healing chatml을 자동 export.
    let dataset_path = match opts
        .dataset_path
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
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
    std::fs::create_dir_all(runs_dir())
        .map_err(|e| LumError::Io(format!("runs 디렉터리 생성 실패: {e}")))?;
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
        auto: auto_mode.is_some(),
    };

    // 영속(상위에 insert) — UI가 즉시 새 run을 표시.
    let mut store = load_store();
    store.runs.insert(0, run.clone());
    save_store(&store)?;

    spawn_training(app, run.clone(), auto_mode)?;
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
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
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

fn spawn_training(app: AppHandle, run: ForgeRun, auto_mode: Option<AutoMode>) -> Result<()> {
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
    lock_cancels().insert(run.id.clone(), cancel_tx);

    // stdout/stderr 두 스트림 모두 줄단위로 push_log + emit. 학습 도구 대부분이 진행률을 stderr에 출력.
    spawn_stream_reader(app.clone(), run.id.clone(), "stdout", stdout);
    spawn_stream_reader(app.clone(), run.id.clone(), "stderr", stderr);

    // Phase 121: 학습 timeout — 폭주한 학습이 영원히 GPU를 점유하는 사고 방지.
    // config.auto_lora_timeout_secs (기본 4시간). user-initiated run에도 동일 적용.
    let timeout_secs = crate::commands::config::load_config()
        .ok()
        .and_then(|c| c.auto_lora_timeout_secs)
        .unwrap_or(4 * 60 * 60);

    // 메인 감시 — wait vs cancel vs timeout race.
    let app_w = app;
    let id_w = run.id;
    tokio::spawn(async move {
        let cancelled;
        let timed_out;
        let exit_code;
        tokio::select! {
            res = child.wait() => {
                cancelled = false;
                timed_out = false;
                exit_code = res.ok().and_then(|s| s.code());
            }
            _ = cancel_rx => {
                cancelled = true;
                timed_out = false;
                let _ = child.start_kill();
                let _ = child.wait().await;
                exit_code = None;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(timeout_secs)) => {
                cancelled = false;
                timed_out = true;
                push_log_line(&id_w, &format!("⏱ timeout {timeout_secs}s 초과 — 프로세스 종료"));
                let _ = child.start_kill();
                let _ = child.wait().await;
                exit_code = None;
            }
        }
        lock_cancels().remove(&id_w);

        let final_status = if cancelled || timed_out {
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

        // Phase 120: 자동 학습 후처리. 성공 시 cursor 갱신 + (호환되면) hot-swap.
        if let Some(mode) = auto_mode {
            if matches!(final_status, ForgeStatus::Completed) {
                advance_auto_cursor(mode.cursor_candidate_ms);
                if mode.auto_load {
                    try_auto_hot_swap(&app_w, &id_w).await;
                }
            }
        }
    });

    Ok(())
}

fn advance_auto_cursor(candidate_ms: u64) {
    let mut store = load_store();
    if candidate_ms > store.auto_train_cursor_ms {
        store.auto_train_cursor_ms = candidate_ms;
        let _ = save_store(&store);
    }
}

/// 학습 완료된 run을 현재 로드된 모델 위에 LoRA로 hot-swap. 호환 안 되면 알림만.
async fn try_auto_hot_swap(app: &AppHandle, run_id: &str) {
    // 1) run 호환 검사 — adapter_config.json 존재 여부.
    let store = load_store();
    let Some(run) = store.runs.iter().find(|r| r.id == run_id).cloned() else {
        return;
    };
    let adapter_cfg = std::path::Path::new(&run.output_dir).join("adapter_config.json");
    let compatible = adapter_cfg.exists();

    let Some(key) = crate::commands::embed::embed_loaded_info() else {
        emit_auto_event(
            app,
            serde_json::json!({
                "phase": "skipped",
                "reason": "추론 모델 미로드 — hot-swap 건너뜀",
                "run_id": run_id,
                "ts_ms": now_ms(),
            }),
        );
        return;
    };

    if !compatible {
        emit_auto_event(
            app,
            serde_json::json!({
                "phase": "skipped",
                "reason": "adapter_config.json 없음 — mlx-lm 어댑터는 mistralrs와 형식이 달라 변환 필요",
                "run_id": run_id,
                "ts_ms": now_ms(),
            }),
        );
        return;
    }

    // loaded_key는 "{model_dir}/{gguf_filename}" 포맷 (mistralrs_inline::load_model 참고).
    let path = std::path::PathBuf::from(&key);
    let (Some(parent), Some(file)) = (path.parent(), path.file_name()) else {
        return;
    };
    let model_dir = parent.to_string_lossy().to_string();
    let gguf_file = file.to_string_lossy().to_string();

    match crate::commands::embed::embed_load_lora(
        app.clone(),
        model_dir,
        gguf_file,
        run.output_dir.clone(),
    )
    .await
    {
        Ok(msg) => emit_auto_event(
            app,
            serde_json::json!({
                "phase": "hot_swapped",
                "run_id": run_id,
                "message": msg,
                "ts_ms": now_ms(),
            }),
        ),
        Err(e) => emit_auto_event(
            app,
            serde_json::json!({
                "phase": "hot_swap_failed",
                "run_id": run_id,
                "error": e,
                "ts_ms": now_ms(),
            }),
        ),
    }
}

fn spawn_stream_reader<R: tokio::io::AsyncRead + Unpin + Send + 'static>(
    app: AppHandle,
    run_id: String,
    stream: &'static str,
    reader: R,
) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            push_log_line(&run_id, &line);
            let _ = app.emit(
                "lora_forge_progress",
                serde_json::json!({
                    "run_id": run_id,
                    "stream": stream,
                    "line": line,
                    "ts_ms": now_ms(),
                }),
            );
        }
    });
}

fn emit_auto_event(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit("lora_forge_auto_event", payload);
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
    let tx = lock_cancels().remove(&run_id);
    Ok(tx.map(|t| t.send(()).is_ok()).unwrap_or(false))
}

#[tauri::command]
pub fn lora_forge_list() -> Result<Vec<ForgeRun>> {
    Ok(load_store().runs)
}

#[tauri::command]
pub fn lora_forge_remove(run_id: String) -> Result<()> {
    // 실행 중이면 먼저 취소.
    if let Some(tx) = lock_cancels().remove(&run_id) {
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

// ── Phase 120: 자동 학습 루프 ─────────────────────────────────────────

#[derive(Serialize)]
pub struct AutoTrainStatus {
    pub enabled: bool,
    pub threshold: u32,
    pub unlearned_count: u32,
    pub cursor_ms: u64,
    pub running: bool,
    /// 베이스 모델 미설정 등 트리거 안 되는 이유. 충족 시 None.
    pub blocked_reason: Option<String>,
}

fn current_unlearned_count(cursor_ms: u64) -> u32 {
    crate::commands::healing_dataset::list_healing_dataset()
        .unwrap_or_default()
        .into_iter()
        .filter(|r| r.decision == "approve" && r.ts_ms > cursor_ms)
        .count() as u32
}

fn any_running() -> bool {
    !lock_cancels().is_empty()
}

#[tauri::command]
pub fn lora_forge_auto_status() -> Result<AutoTrainStatus> {
    let cfg = crate::commands::config::load_config().unwrap_or_default();
    let enabled = cfg.auto_lora_enabled.unwrap_or(false);
    let threshold = cfg.auto_lora_threshold.unwrap_or(25);
    let cursor_ms = load_store().auto_train_cursor_ms;
    let unlearned_count = current_unlearned_count(cursor_ms);
    let running = any_running();
    let blocked_reason = blocked_reason(enabled, threshold, unlearned_count, running, &cfg);
    Ok(AutoTrainStatus {
        enabled,
        threshold,
        unlearned_count,
        cursor_ms,
        running,
        blocked_reason,
    })
}

fn blocked_reason(
    enabled: bool,
    threshold: u32,
    unlearned: u32,
    running: bool,
    cfg: &crate::commands::config::AppConfig,
) -> Option<String> {
    if !enabled {
        return Some("자동 학습이 비활성화돼있습니다".into());
    }
    if running {
        return Some("이미 다른 학습이 진행 중".into());
    }
    if cfg
        .auto_lora_base_model
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
    {
        return Some("베이스 모델을 설정해주세요".into());
    }
    if unlearned < threshold {
        return Some(format!(
            "아직 {} / {} (미학습 approve)",
            unlearned, threshold
        ));
    }
    None
}

fn build_auto_options(
    cfg: &crate::commands::config::AppConfig,
    unlearned: u32,
) -> Option<ForgeOptions> {
    let enabled = cfg.auto_lora_enabled.unwrap_or(false);
    let threshold = cfg.auto_lora_threshold.unwrap_or(25);
    if !enabled || unlearned < threshold {
        return None;
    }
    let base_model = cfg
        .auto_lora_base_model
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())?
        .to_string();
    let runtime = cfg
        .auto_lora_runtime
        .clone()
        .filter(|s| s == "mlx-lm" || s == "axolotl")
        .unwrap_or_else(|| "mlx-lm".to_string());
    Some(ForgeOptions {
        task: format!("auto: healing approve {unlearned}건 누적"),
        runtime,
        base_model,
        dataset_path: None,
        iters: cfg.auto_lora_iters.unwrap_or(200),
        lora_rank: cfg.auto_lora_rank.unwrap_or(8),
        learning_rate: cfg.auto_lora_lr.unwrap_or(1e-5),
    })
}

/// approve 시 호출. fire-and-forget. 자동 학습이 활성화돼있고 threshold 도달 시 spawn.
/// 동시 실행 가드: 이미 다른 run이 진행 중이면 skip.
pub async fn maybe_auto_train(app: AppHandle) {
    if any_running() {
        return;
    }
    let cfg = crate::commands::config::load_config().unwrap_or_default();
    let cursor_ms = load_store().auto_train_cursor_ms;
    let unlearned = current_unlearned_count(cursor_ms);
    let Some(opts) = build_auto_options(&cfg, unlearned) else {
        return;
    };

    let cursor_candidate_ms = now_ms();
    let auto_load = cfg.auto_lora_auto_load.unwrap_or(true);
    let mode = AutoMode {
        cursor_candidate_ms,
        auto_load,
    };

    emit_auto_event(
        &app,
        serde_json::json!({
            "phase": "starting",
            "unlearned_count": unlearned,
            "ts_ms": cursor_candidate_ms,
        }),
    );

    match start_internal(app.clone(), opts, Some(mode)).await {
        Ok(run) => emit_auto_event(
            &app,
            serde_json::json!({
                "phase": "spawned",
                "run_id": run.id,
                "ts_ms": now_ms(),
            }),
        ),
        Err(e) => emit_auto_event(
            &app,
            serde_json::json!({
                "phase": "error",
                "error": e.to_string(),
                "ts_ms": now_ms(),
            }),
        ),
    }
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
            auto: false,
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
            auto: true,
        };
        let j = serde_json::to_string(&r).unwrap();
        let back: ForgeRun = serde_json::from_str(&j).unwrap();
        assert_eq!(back.status, ForgeStatus::Completed);
        assert_eq!(back.exit_code, Some(0));
        assert!(j.contains("\"completed\""));
    }

    fn auto_cfg() -> crate::commands::config::AppConfig {
        let mut c = crate::commands::config::AppConfig::default();
        c.auto_lora_enabled = Some(true);
        c.auto_lora_threshold = Some(25);
        c.auto_lora_base_model = Some("Qwen/X".into());
        c
    }

    #[test]
    fn build_auto_options_disabled_returns_none() {
        let mut c = auto_cfg();
        c.auto_lora_enabled = Some(false);
        assert!(build_auto_options(&c, 100).is_none());
    }

    #[test]
    fn build_auto_options_below_threshold_returns_none() {
        let c = auto_cfg();
        assert!(build_auto_options(&c, 24).is_none());
    }

    #[test]
    fn build_auto_options_no_base_returns_none() {
        let mut c = auto_cfg();
        c.auto_lora_base_model = None;
        assert!(build_auto_options(&c, 100).is_none());
        c.auto_lora_base_model = Some("   ".into());
        assert!(build_auto_options(&c, 100).is_none());
    }

    #[test]
    fn build_auto_options_picks_defaults_when_unset() {
        let c = auto_cfg();
        let o = build_auto_options(&c, 30).unwrap();
        assert_eq!(o.runtime, "mlx-lm");
        assert_eq!(o.iters, 200);
        assert_eq!(o.lora_rank, 8);
        assert!(o.task.contains("30건"));
        assert!(
            o.dataset_path.is_none(),
            "자동 학습은 dataset 자동 export 사용"
        );
    }

    #[test]
    fn build_auto_options_invalid_runtime_falls_back_to_mlx() {
        let mut c = auto_cfg();
        c.auto_lora_runtime = Some("qlora".into());
        let o = build_auto_options(&c, 30).unwrap();
        assert_eq!(o.runtime, "mlx-lm");
    }

    #[test]
    fn blocked_reason_disabled() {
        let c = auto_cfg();
        let r = blocked_reason(false, 25, 50, false, &c);
        assert!(r.unwrap().contains("비활성"));
    }

    #[test]
    fn blocked_reason_running() {
        let c = auto_cfg();
        let r = blocked_reason(true, 25, 50, true, &c);
        assert!(r.unwrap().contains("진행 중"));
    }

    #[test]
    fn blocked_reason_below_threshold() {
        let c = auto_cfg();
        let r = blocked_reason(true, 25, 10, false, &c);
        assert!(r.unwrap().contains("10 / 25"));
    }

    #[test]
    fn blocked_reason_no_base() {
        let mut c = auto_cfg();
        c.auto_lora_base_model = None;
        let r = blocked_reason(true, 25, 100, false, &c);
        assert!(r.unwrap().contains("베이스"));
    }

    #[test]
    fn blocked_reason_all_clear_returns_none() {
        let c = auto_cfg();
        assert!(blocked_reason(true, 25, 100, false, &c).is_none());
    }
}
