import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const argv = new Set(process.argv.slice(2));
const asJson = argv.has("--json");
const strictVoice = argv.has("--strict-voice");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function hasAll(relPath, patterns) {
  const text = read(relPath);
  return patterns.every((re) => re.test(text));
}

function statusIcon(status) {
  if (status === "PASS") return "✅";
  if (status === "PARTIAL") return "🟡";
  return "❌";
}

const requiredChecks = [
  {
    key: "pty_core",
    name: "Real PTY 코어",
    run: () =>
      hasAll("src-tauri/src/lib.rs", [
        /spawn_pty/,
        /write_to_pty/,
      ]),
  },
  {
    key: "embedded_ai_route",
    name: "임베디드 AI 라우팅",
    run: () =>
      hasAll("src-tauri/src/commands/ai.rs", [
        /pub async fn stream_ai_command/,
        /AI_ROUTE_EVENT/,
      ]),
  },
  {
    key: "react_edit_safety",
    name: "ReAct 코드편집+Undo",
    run: () =>
      hasAll("src-tauri/src/commands/react_agent.rs", [
        /write_file/,
        /apply_patch/,
        /delete_file/,
        /pub fn react_agent_undo/,
      ]),
  },
  {
    key: "memory_vault",
    name: "Persistent Memory Vault",
    run: () =>
      hasAll("src-tauri/src/commands/recall.rs", [
        /pub async fn recall_search/,
        /pub fn recall_forget/,
      ]),
  },
  {
    key: "healing_loop",
    name: "Healing 데이터 수집",
    run: () =>
      hasAll("src-tauri/src/commands/healing_dataset.rs", [
        /pub async fn record_healing_decision/,
      ]),
  },
  {
    key: "lora_forge",
    name: "LoRA Forge 실행 경로",
    run: () =>
      hasAll("src-tauri/src/commands/lora_forge.rs", [
        /pub async fn lora_forge_start/,
      ]),
  },
  {
    key: "mcp_bundle",
    name: "MCP 추천 번들",
    run: () =>
      hasAll("src-tauri/src/mcp.rs", [
        /pub fn mcp_recommended_servers/,
        /pub async fn mcp_install_recommended/,
      ]),
  },
  {
    key: "intent_router",
    name: "자연어 코딩 의도 라우터",
    run: () =>
      hasAll("src/utils/inputRouter.ts", [
        /export function detectCodingIntent/,
        /export function routeInput/,
      ]),
  },
  {
    key: "code_intel_surface",
    name: "Code Intel 도구 surface",
    run: () =>
      hasAll("src-tauri/src/commands/react_agent.rs", [
        /query_codebase/,
        /query_graph/,
      ]),
  },
];

function voiceStatus() {
  const text = read("src-tauri/src/audio.rs");
  const hasApi =
    /pub async fn start_voice_recording/.test(text) &&
    /pub async fn stop_voice_recording/.test(text);
  const hasHook = /resolve_voice_hook/.test(text);
  const hasNativeCapture =
    /start_native_voice_capture/.test(text) &&
    /transcribe_native_wav/.test(text) &&
    /WHISPER_SAMPLE_RATE/.test(text);
  const hasVad = /native_vad_stop_requested/.test(text) && /DEFAULT_VAD_SILENCE_MS/.test(text);
  const hasLazyModelDownload = /ensure_native_whisper_model/.test(text) && /MODEL_DOWNLOAD_FAILED/.test(text);

  if (!hasApi) {
    return { status: "FAIL", detail: "음성 시작/중지 API 없음" };
  }
  if (hasNativeCapture) {
    return {
      status: hasVad && hasLazyModelDownload ? "PASS" : "PARTIAL",
      detail: hasVad
        ? hasLazyModelDownload
          ? "CPAL 로컬 캡처 + VAD 자동 종료 + whisper.cpp 전사 + 모델 lazy download"
          : "CPAL 로컬 캡처 + VAD 자동 종료 + whisper.cpp 전사 경로(모델 자동 배포 대기)"
        : "CPAL 로컬 캡처 + whisper.cpp 전사 경로(VAD·모델 자동 배포 대기)",
    };
  }
  if (hasHook) {
    return { status: "PARTIAL", detail: "외부 hook 기반(STT 임베디드 완전통합 전 단계)" };
  }
  return { status: "PARTIAL", detail: "구현 경로 확인 필요" };
}

function buildReport() {
  const required = [];
  let requiredPass = 0;
  let requiredFail = 0;

  for (const check of requiredChecks) {
    const ok = check.run();
    const status = ok ? "PASS" : "FAIL";
    if (ok) {
      requiredPass += 1;
    } else {
      requiredFail += 1;
    }
    required.push({
      key: check.key,
      name: check.name,
      status,
    });
  }

  const voice = voiceStatus();
  const passCore = requiredFail === 0;
  const passStrict = passCore && voice.status === "PASS";
  const overall = strictVoice ? passStrict : passCore;

  return {
    generatedAt: new Date().toISOString(),
    options: {
      strictVoice,
    },
    required,
    deferred: {
      key: "voice_input",
      name: "Voice 입력 경로",
      status: voice.status,
      detail: voice.detail,
    },
    summary: {
      requiredPass,
      requiredTotal: requiredChecks.length,
      requiredFail,
      passCore,
      passStrict,
      overall,
      mode: strictVoice ? "strict-voice" : "core-only",
    },
  };
}

function printHuman(report) {
  const lines = [];
  lines.push("LUM MVP Readiness Check");
  lines.push(`기준 시각: ${report.generatedAt}`);
  lines.push("");
  lines.push("[필수 코어 항목]");
  for (const item of report.required) {
    lines.push(`${statusIcon(item.status)} ${item.name}`);
  }
  lines.push("");
  lines.push("[보류/부분 항목]");
  lines.push(
    `${statusIcon(report.deferred.status)} ${report.deferred.name} — ${report.deferred.detail}`,
  );
  lines.push("");
  lines.push(
    `요약: 필수 ${report.summary.requiredPass}/${report.summary.requiredTotal} PASS` +
      (report.summary.requiredFail > 0 ? `, FAIL ${report.summary.requiredFail}` : ", FAIL 0"),
  );
  if (report.summary.passCore) {
    lines.push("판정: MVP 코어 충족 (Voice는 별도 고도화 트랙)");
  } else {
    lines.push("판정: MVP 코어 미충족 (필수 FAIL 항목 해결 필요)");
  }
  if (report.options.strictVoice) {
    lines.push(
      report.summary.passStrict
        ? "엄격 판정: Voice 포함 PASS"
        : "엄격 판정: Voice 포함 FAIL",
    );
  }
  console.log(lines.join("\n"));
}

const report = buildReport();
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHuman(report);
}

if (!report.summary.overall) {
  process.exitCode = 1;
}
