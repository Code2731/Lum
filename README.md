<div align="center">

# LUM Terminal

**A Warp-style AI terminal emulator with real PTY, local AI, and zero cloud dependency.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-orange?logo=rust)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)

[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Code2731/Lum/releases/latest)
[![Download for macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/Code2731/Lum/releases/latest)
[![Download for Linux](https://img.shields.io/badge/Download-Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/Code2731/Lum/releases/latest)

**[English](#english) · [한국어](#한국어)**

</div>

---

## English

### What is LUM?

LUM (Local Universal Machine) is a **real terminal emulator** that runs your actual shell — not a chat UI. Built on [Tauri v2](https://tauri.app), it integrates a local AI engine ([xLLM / TabbyAPI](https://github.com/theroyallab/tabbyAPI)) directly into the terminal workflow. Zero cloud calls, zero API fees, full privacy.

> Think of it as Warp Terminal, but fully open-source and running 100% on your own hardware.

### Key Features

| Feature | Description |
|---------|-------------|
| **Real PTY Terminal** | `portable-pty` runs your actual `$SHELL` (zsh/bash/PowerShell). xterm.js renders ANSI colors, scrollback, and VT100 sequences. |
| **AI Inline Edit** | Type `# find large files` → local AI converts it to the right shell command. Tab to confirm. |
| **AI Command Explain** | Type `? awk '{print $1}'` → AI explains what the command does in plain language. |
| **Agentic Task Loop** | Type `>> deploy the app` → AI plans multi-step tasks, shows a risk-annotated plan, and executes step by step with your approval. |
| **CLI Ghost Text** | Fish-shell style autocomplete for `git`, `npm`, `cargo`, `docker`, `kubectl`, and 30+ more CLIs. |
| **Semantic History** | `Ctrl+R` — embedding-based search across your entire command history. |
| **AI Commit Message** | `Cmd+Shift+G` — analyzes `git diff --cached` and generates a Conventional Commit message. |
| **AI Diff Reviewer** | `Cmd+Shift+R` — reviews staged changes and annotates each file as safe / caution / risk. |
| **AI Self-Healing** | Detects errors in terminal output → analyzes cause → suggests a fix with a safety badge. |
| **Split Panes** | Horizontal/vertical split with `Cmd+Shift+D/E`. Each pane has its own PTY session. |
| **Multi-Tab** | `Cmd+T` to open, `Cmd+W` to close, double-click to rename. |
| **SSH Profiles** | Connect to remote hosts via SSH; profiles saved to `~/.lum_ssh_profiles.json`. |
| **Session Persistence** | Tab layout and split state auto-saved and restored on restart. |
| **Terminal Themes** | 5 built-in themes (Dracula, Tokyo Night, One Dark, Solarized, GitHub Dark) + font controls. |
| **Quick Actions Bar** | Pin favorite commands; launch with `Cmd+1–9`. |
| **Hardware-Aware AI** | Auto-detects RAM and GPU → recommends the best EXL2 model for your machine. |
| **Auto Update** | Background version check; one-click download and install via `tauri-plugin-updater`. |
| **xLLM Optimization** | PD Disaggregation, Elastic Scheduling, KV Cache Q4/Q8/FP16, Speculative Decoding, Sparse Attention, EPD Streaming. |
| **Smart Env Auto-Loader** | Detects `.nvmrc`, `pyproject.toml`, `Pipfile`, `package.json`, etc. on `cd` → slide-up toast with one-click install commands. |
| **Script Library** | Save agent task runs as reusable scripts. Browse, run, and delete from a side panel (`Cmd+Shift+L`). |
| **Notification Center** | Aggregates long-running command completions, agent task results, healing triggers, and env detections in one bell-icon panel. |
| **Smart Paste** | Detects multi-line clipboard content → dialog to run all at once, step-by-step, or paste as raw text. |
| **Right-click Context Menu** | Right-click any selected terminal text → copy, run as command, AI explain, web search, or open file/URL. |
| **System Monitor** | `Cmd+Shift+M` — live CPU & memory gauges + top-6 processes by CPU and RAM, 2-second auto-refresh. |
| **Dual Engine (Fast + Heavy)** | TabbyAPI Fast Track for 7~14B EXL2 (12~16 tok/s) + mistral.rs Heavy Track for BF16 ISQ or GGUF MoE (30B+ models). Status indicator in title bar (`xLLM ●` / `mistral ●`). |
| **LUM-MCP-server (Rust native)** | Standalone `lum-mcp-server.exe` exposes 7 LUM tools (read_file / list_directory / git_diff / apply_edit_block / get_repo_map / run_tests / read_file_lines) via stdio MCP. CrewAI / Claude Desktop / any MCP client can drive LUM directly. |
| **DRAM/VRAM Tiering** | Auto-injected PagedAttention (`--pa-ctxt-len` + `--pa-gpu-mem-usage` linked to safety_mode 70/80/90%) makes 30B+ models practical on 10GB VRAM. |
| **Edit Block Engine** | SEARCH/REPLACE patches with exact-match + fuzzy whitespace fallback. AI proposes edits → user approves on the EditBlockCard → applied with diff preview. |
| **Repo Map (tree-sitter + PageRank)** | Token-budget-bounded codebase summary by symbol importance. Used as automatic AI context for refactoring tasks. |
| **Test Feedback Loop** | Auto-detect project test runner (cargo / pytest / npm / go) → run → on failure, AI proposes a fix → re-run loop. |
| **GPU Safety Mode** | `safe` (70% VRAM) / `balanced` (80%) / `max` (90%) with manual override slider. Auto-writes TabbyAPI `config.yml` and feeds mistral.rs via `--pa-gpu-mem-usage`. |

### Architecture

```
User input (xterm.js onData)
        │
        │  Tauri IPC
        ▼
write_to_pty ──► SyncSender ──► Writer thread ──► PTY master ──► $SHELL
                                                        │
                                              Reader thread
                                                        │
                                             pty_data event
                                                        │
                                          xterm.js.write() ──► Screen
```

- **Backend** — Rust + Tauri v2. Channel-based PTY (writer / reader threads separated). AI commands proxied to local xLLM server.
- **Frontend** — React 19 + TypeScript + Tailwind CSS v4. xterm.js for rendering. Hooks for every major feature.
- **AI Layer** — xLLM (TabbyAPI / ExLlamaV2) as primary; Gemini API as optional cloud fallback.
- **Local-AI Feature Flag** — `burn` / `wgpu` / `tokenizers` excluded from default build (~150 MB smaller binary).

### Tech Stack

- **Rust** — Tauri v2, portable-pty, reqwest, libp2p, sysinfo, serde, tree-sitter (Rust/TS/JS/Python), petgraph (PageRank), nvml-wrapper (NVIDIA VRAM)
- **Frontend** — React 19, TypeScript, Tailwind CSS v4, xterm.js, react-resizable-panels, react-virtuoso
- **AI engines** — TabbyAPI / ExLlamaV2 (EXL2 Fast Track) + mistral.rs (BF16 ISQ / GGUF Heavy Track) + Gemini API (cloud fallback)
- **Agent ecosystem** — `lum-mcp-server.exe` (Rust native stdio MCP) + `crew/` (CrewAI dual engine workspace, separate Python project)
- **Testing** — Vitest (unit), Playwright (E2E smoke tests), `cargo test` (Rust 99 tests)

### Getting Started

**Prerequisites**

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) 20+
- [TabbyAPI](https://github.com/theroyallab/tabbyAPI) *(optional — for local AI features)*

**Run in development**

```bash
git clone https://github.com/Code2731/Lum.git
cd Lum
npm install
npm run tauri dev
```

**Production build**

```bash
npm run tauri build                             # lightweight (no on-device inference)
npm run tauri build -- --features local-ai      # full build with wgpu inference
```

### AI Setup (optional)

LUM works as a plain terminal with no AI server. To enable AI features:

1. Install and start [TabbyAPI](https://github.com/theroyallab/tabbyAPI) (default: `http://127.0.0.1:5000`)
2. On first launch, the Onboarding Wizard detects your hardware and recommends a model
3. Download the recommended EXL2 model from the built-in Model Manager

> No TabbyAPI? Set `GEMINI_API_KEY` in your environment for cloud-based AI fallback.

### Platform Support

| Platform | Shell | Desktop Automation | Bundle |
|----------|-------|-------------------|--------|
| macOS (Apple Silicon) | zsh / bash | enigo | `.dmg` |
| macOS (Intel) | zsh / bash | enigo | `.dmg` |
| Windows | PowerShell / cmd.exe | enigo | `.msi` / `.exe` |
| Linux (X11) | bash / zsh | enigo | `.deb` / `.AppImage` |
| Linux (Wayland) | bash / zsh | not supported (use XWayland) | `.deb` / `.AppImage` |

---

## 한국어

### LUM이란?

LUM(Local Universal Machine)은 **실제 셸을 실행하는 터미널 에뮬레이터**입니다 — 채팅 UI가 아닙니다. [Tauri v2](https://tauri.app) 위에 구축되었으며, 로컬 AI 엔진([xLLM / TabbyAPI](https://github.com/theroyallab/tabbyAPI))을 터미널 워크플로우에 직접 통합합니다. 클라우드 호출 없음, API 비용 없음, 완전한 개인정보 보호.

> Warp Terminal과 비슷하지만, 완전한 오픈소스이며 100% 사용자 하드웨어에서 동작합니다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| **실제 PTY 터미널** | `portable-pty`로 실제 `$SHELL`(zsh/bash/PowerShell) 구동. xterm.js로 ANSI 색상·스크롤백·VT100 렌더링. |
| **AI 인라인 편집** | `# 대용량 파일 찾기` 입력 → 로컬 AI가 셸 명령어로 변환. Tab으로 확정. |
| **AI 명령어 설명** | `? awk '{print $1}'` 입력 → AI가 명령어를 평문으로 설명. |
| **에이전트 태스크 루프** | `>> 앱 배포` 입력 → AI가 다단계 계획 수립, 위험도 배지와 함께 표시 후 단계별 실행. |
| **CLI Ghost Text** | `git`, `npm`, `cargo`, `docker`, `kubectl` 등 38개+ CLI의 Fish-shell 스타일 자동완성. |
| **의미 기반 히스토리** | `Ctrl+R` — 임베딩 기반 자연어 명령어 히스토리 검색. |
| **AI 커밋 메시지** | `Cmd+Shift+G` — `git diff --cached` 분석 후 Conventional Commit 자동 생성. |
| **AI Diff 리뷰어** | `Cmd+Shift+R` — 스테이지된 변경사항을 파일별 safe / caution / risk로 분석. |
| **AI 자가 치유** | 터미널 에러 자동 감지 → 원인 분석 → 안전도 배지와 함께 수정 명령어 제안. |
| **스플릿 팬** | `Cmd+Shift+D/E`로 수평/수직 분할. 각 팬은 독립 PTY 세션. |
| **멀티 탭** | `Cmd+T` 새 탭, `Cmd+W` 닫기, 더블클릭으로 이름 변경. |
| **SSH 프로필** | SSH 원격 연결 및 프로필 저장(`~/.lum_ssh_profiles.json`). |
| **세션 영속성** | 탭 레이아웃·분할 상태 자동 저장 → 재시작 시 복원. |
| **터미널 테마** | 5개 내장 테마(Dracula, Tokyo Night, One Dark, Solarized, GitHub Dark) + 폰트 컨트롤. |
| **퀵 액션 바** | 자주 쓰는 명령어 고정; `Cmd+1~9`로 즉시 실행. |
| **하드웨어 인식 AI** | RAM·GPU 자동 감지 → 최적화된 EXL2 모델 추천. |
| **자동 업데이트** | 백그라운드 버전 확인; 원클릭 다운로드·설치. |
| **xLLM 최적화** | PD Disaggregation, Elastic Scheduling, KV Cache Q4/Q8/FP16, Speculative Decoding, Sparse Attention, EPD Streaming. |
| **스마트 환경 자동 로더** | `cd` 시 `.nvmrc`, `pyproject.toml`, `Pipfile`, `package.json` 등 감지 → 설치 명령어 슬라이드업 토스트. |
| **스크립트 라이브러리** | 에이전트 태스크를 재사용 스크립트로 저장·실행 (`Cmd+Shift+L`). |
| **알림 센터** | 장시간 명령어·에이전트·AI 치유·환경 감지 이벤트를 벨 아이콘 패널에 통합. |
| **스마트 붙여넣기** | 멀티라인 클립보드 자동 감지 → 한 번에 실행 / 단계별 실행 / 텍스트 그대로 붙여넣기 선택 다이얼로그. |
| **우클릭 컨텍스트 메뉴** | 터미널 텍스트 선택 후 우클릭 → 복사 / 명령어 실행 / AI 설명 / 웹 검색 / 파일·URL 열기. |
| **시스템 모니터** | `Cmd+Shift+M` — CPU·메모리 게이지 + CPU/메모리 상위 프로세스 6개, 2초마다 자동 갱신. |
| **듀얼 엔진 (Fast + Heavy)** | TabbyAPI Fast Track (7~14B EXL2, 12~16 tok/s) + mistral.rs Heavy Track (BF16 ISQ 또는 GGUF MoE, 30B+). 타이틀 바에 `xLLM ●` / `mistral ●` 상태 표시. |
| **LUM-MCP-server (Rust 네이티브)** | 별도 `lum-mcp-server.exe`가 LUM 도구 7개(read_file / list_directory / git_diff / apply_edit_block / get_repo_map / run_tests / read_file_lines)를 stdio MCP로 노출. CrewAI / Claude Desktop / 모든 MCP 클라이언트가 LUM을 직접 제어 가능. |
| **DRAM/VRAM 계층화** | PagedAttention 자동 주입 (`--pa-ctxt-len` + safety_mode 70/80/90% 연동 `--pa-gpu-mem-usage`)으로 RTX 3080 10GB에 30B+ 모델 실용화. |
| **편집 블록 엔진** | SEARCH/REPLACE 패치 (exact match + fuzzy whitespace 폴백). AI 제안 → EditBlockCard에서 사용자 승인 → diff 미리보기 후 적용. |
| **레포 맵 (tree-sitter + PageRank)** | 토큰 예산 기반 코드베이스 요약 (symbol 중요도순). 리팩토링 작업의 AI 자동 컨텍스트. |
| **테스트 피드백 루프** | 프로젝트 테스트 러너 자동 감지 (cargo / pytest / npm / go) → 실행 → 실패 시 AI 수정 제안 → 재실행 루프. |
| **GPU 안전 모드** | `safe` (70% VRAM) / `balanced` (80%) / `max` (90%) + 수동 슬라이더. TabbyAPI `config.yml` 자동 작성 + mistral.rs `--pa-gpu-mem-usage` 연동. |

### 시작하기

```bash
git clone https://github.com/Code2731/Lum.git
cd Lum
npm install
npm run tauri dev
```

**AI 기능 활성화 (선택)**

1. [TabbyAPI](https://github.com/theroyallab/tabbyAPI) 설치 후 실행 (기본 포트: `5000`)
2. 앱 첫 실행 시 온보딩 마법사가 하드웨어를 자동 분석하고 최적 모델 추천
3. 내장 모델 매니저에서 추천 EXL2 모델 다운로드

> TabbyAPI 없이도 터미널로 사용 가능합니다. 클라우드 AI는 환경변수에 `GEMINI_API_KEY`를 설정하세요.

### 개발 로드맵

<details>
<summary>Phase 23 ~ 83 전체 완료 목록 보기</summary>

- [x] Phase 23: Real PTY Terminal (portable-pty + xterm.js)
- [x] Phase 24: Cross-Platform Polish
- [x] Phase 25: AI Self-Healing Loop
- [x] Phase 27: Multi-Tab PTY
- [x] Phase 28: Split Pane Terminal
- [x] Phase 29: Command Blocks (OSC 133 Shell Integration)
- [x] Phase 30: Semantic History Search
- [x] Phase 31: AI Commit Message
- [x] Phase 32: xLLM 실전 최적화 (PD Disaggregation, Elastic Scheduling, KV Cache)
- [x] Phase 33: CLI Ghost Text + Session Persistence
- [x] Phase 34: AI Inline Edit (`#` 프리픽스)
- [x] Phase 35: AI Context Awareness (프로젝트 타입 자동 감지)
- [x] Phase 36: Auto Update Check
- [x] Phase 37: SSD + Sparse Attention + EPD Streaming
- [x] Phase 38: First-Run Onboarding Wizard
- [x] Phase 39: AI Diff Reviewer
- [x] Phase 40: Terminal Themes & Font
- [x] Phase 41: Quick Actions Bar
- [x] Phase 42: Smart Tab Rename & Auto-Icon
- [x] Phase 43: Terminal Search (`Cmd+F`)
- [x] Phase 44: AI Explain Command (`?` 프리픽스)
- [x] Phase 45: Long-Running Command Notifier
- [x] Phase 46: Workspace Save & Restore
- [x] Phase 47: SSH Terminal
- [x] Phase 48: CLI Autocomplete DB 확장 (38개 CLI)
- [x] Phase 49: Smart Diff Truncation
- [x] Phase 50: React ErrorBoundary
- [x] Phase 51: Playwright E2E 테스트
- [x] Phase 52: SSH 프로필 영속성
- [x] Phase 53: 자동 업데이트 설치
- [x] Phase 54: local-ai Feature Flag (~150MB 절감)
- [x] Phase 55: Agentic Task Loop (`>>` 프리픽스)
- [x] Phase 56: AI Chat Sidebar (`Cmd+Shift+A` — 멀티턴 대화, 터미널 컨텍스트 자동 주입)
- [x] Phase 57: Smart Environment Auto-Loader (cwd 변경 시 환경 파일 자동 감지, 설치 명령어 슬라이드업 토스트)
- [x] Phase 58: Script Library (`Cmd+Shift+L` — 에이전트 태스크 저장·재실행, 스크립트 패널)
- [x] Phase 59: Notification Center (명령/에이전트/힐링/환경 이벤트 통합 벨 아이콘 패널)
- [x] Phase 60: Smart Paste (멀티라인 붙여넣기 감지 → 한 번에 실행 / 단계별 실행 / 텍스트 붙여넣기 선택 다이얼로그)
- [x] Phase 61: Right-click Context Menu (선택 텍스트 우클릭 → 복사 / 명령어 실행 / AI 설명 / 웹 검색 / 파일·URL 열기)
- [x] Phase 62: System Monitor (Cmd+Shift+M — CPU/메모리 게이지, 상위 프로세스, 2초 폴링)
- [x] Phase 63: Apple Silicon MLX-LM 전환 (aarch64 분기 자동 적용)
- [x] Phase 64: AI Chat 코드베이스 인식 (cwd / git / 최근 파일 자동 컨텍스트)
- [x] Phase 65~66: Model Manager 확장 (MLX/EXL2 카테고리 필터, NVIDIA 전용 기능 ⚠ 배지)
- [x] Phase 67: Windows 크로스플랫폼 완전 지원 (TabbyAPI venv .venv\Scripts\, nvidia-smi VRAM 감지, 14B EXL2 추천)
- [x] Phase 68: File Explorer + Welcome Hints (Cmd+B 토글, OS별 open 분기)
- [x] Phase 69: Warp 스타일 UX 전면 개편 (WarpInputBar 자연어 기본 + 셸 fast-path + AI 인라인 스트림)
- [x] Phase 70: Repo Map + SEARCH/REPLACE Edit Engine (tree-sitter + petgraph PageRank, fuzzy fallback, EditBlockCard)
- [x] Phase 71: GPU 안전 모드 (safe 70% / balanced 80% / max 90% + 슬라이더 override, NVML 정확 VRAM)
- [x] Phase 72: 모델 capability 토글 (vision / reasoning, `<think>` 체인 UI 숨김)
- [x] Phase 73: 테스트 피드백 루프 (test_runner 자동 감지 + 실패 시 AI 자가 수정)
- [x] Phase 74~77: MCP 클라이언트 + 도구 통합 + 비전 모델 이미지 전달
- [x] Phase 78~79: mistral.rs 진짜 통합 (Windows hf-hub 0.4.3 panic 우회) + Dual Engine UX 정합화 (다운로드 분리·갱신 버튼·상태 표시)
- [x] Phase 80: TDD 회귀 가드 (build_mistral_args / classify_repo_http_code 등 4개 헬퍼 추출) + 터미널 Ctrl+C/V
- [x] Phase 81: CrewAI 통합 + Heavy 한계 발견 (`crew/` 별도 Python, lum_llm.py 공통 헬퍼, lessons learned: thinking 모델은 multi-agent 부적합)
- [x] Phase 82a/b: LUM-MCP-server (Rust 네이티브 stdio JSON-RPC, 7개 도구 노출, Cargo `[[bin]]`로 분리)
- [x] Phase 82c: CrewAI ↔ lum-mcp 통합 (MCPServerAdapter + StdioServerParameters, 7개 도구 BaseTool 자동 변환)
- [x] Phase 83: DRAM/VRAM 계층화 자동화 (mistral.rs `--pa-ctxt-len`/`--pa-gpu-mem-usage`/`-n` 자동 주입, safety_mode 연동, 30B+ 실용화)
- [x] Phase 84: SSD (Speculative Decoding) 서버 사이드 통합 (TabbyAPI `config.yml`에 `draft_model:` 섹션 자동 주입, 폴더 검증 후 활성/비활성 결정, Phase 37 body 인자가 진짜 동작; Cargo `default-run = "tauri-app"` 회귀 fix)
- [x] Phase 84b: SSD 동작 검증 + UI 정리 (`config.yml` `model:` 섹션에 `model_name:` 자동 주입이 진짜 활성화 키, native `<select>` 다크모드 fix, [✕ 끄기] 명시 버튼; RTX 3080 10GB 검증: 7B+3B = 1.59 T/s VRAM swap, 7B+1.5B = 48.99 T/s — SSD 효과는 하드웨어×모델 페어에 강하게 의존; `lucyknada/Qwen_Qwen2.5-Coder-1.5B-Instruct-exl2` ModelManager 추가)

</details>

---

<div align="center">

LUM은 터미널을 단순한 도구가 아닌, AI와 협업하는 개발 공간으로 바꿉니다.

*LUM turns the terminal from a tool into a collaborative development space with AI.*

</div>
