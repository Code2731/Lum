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

- **Rust** — Tauri v2, portable-pty, reqwest, libp2p, sysinfo, serde
- **Frontend** — React 19, TypeScript, Tailwind CSS v4, xterm.js, react-resizable-panels, react-virtuoso
- **AI** — xLLM / TabbyAPI (EXL2 models), Gemini API (fallback)
- **Testing** — Vitest (unit), Playwright (E2E smoke tests)

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
<summary>Phase 23 ~ 55 전체 완료 목록 보기</summary>

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

</details>

---

<div align="center">

LUM은 터미널을 단순한 도구가 아닌, AI와 협업하는 개발 공간으로 바꿉니다.

*LUM turns the terminal from a tool into a collaborative development space with AI.*

</div>
