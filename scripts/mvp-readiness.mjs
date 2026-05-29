import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

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
  const hasEmbeddedEngine = /cpal|whisper[_-]rs|whisper\.cpp/.test(text);

  if (!hasApi) {
    return { status: "FAIL", detail: "음성 시작/중지 API 없음" };
  }
  if (hasEmbeddedEngine && !hasHook) {
    return { status: "PASS", detail: "임베디드 STT 경로로 보임" };
  }
  if (hasHook) {
    return { status: "PARTIAL", detail: "외부 hook 기반(STT 임베디드 완전통합 전 단계)" };
  }
  return { status: "PARTIAL", detail: "구현 경로 확인 필요" };
}

const lines = [];
let requiredPass = 0;
let requiredFail = 0;

lines.push("LUM MVP Readiness Check");
lines.push(`기준 시각: ${new Date().toISOString()}`);
lines.push("");
lines.push("[필수 코어 항목]");
for (const check of requiredChecks) {
  const ok = check.run();
  if (ok) {
    requiredPass += 1;
    lines.push(`${statusIcon("PASS")} ${check.name}`);
  } else {
    requiredFail += 1;
    lines.push(`${statusIcon("FAIL")} ${check.name}`);
  }
}

const voice = voiceStatus();
lines.push("");
lines.push("[보류/부분 항목]");
lines.push(`${statusIcon(voice.status)} Voice 입력 경로 — ${voice.detail}`);

lines.push("");
lines.push(
  `요약: 필수 ${requiredPass}/${requiredChecks.length} PASS` +
    (requiredFail > 0 ? `, FAIL ${requiredFail}` : ", FAIL 0"),
);
lines.push(
  requiredFail === 0
    ? "판정: MVP 코어 충족 (Voice는 별도 고도화 트랙)"
    : "판정: MVP 코어 미충족 (필수 FAIL 항목 해결 필요)",
);

console.log(lines.join("\n"));

if (requiredFail > 0) {
  process.exitCode = 1;
}
