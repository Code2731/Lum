# LUM: Local Universal Machine (v2.0 Spatial)

실제로 동작하는 **PTY 터미널 에뮬레이터** 위에 로컬 AI를 통합한 Warp 스타일 AI 터미널입니다.

[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Code2731/Lum/releases/latest/download/LUM-Setup.exe)
[![Download for macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/Code2731/Lum/releases/latest/download/LUM.dmg)

## 🖥 실제 터미널 에뮬레이터

LUM은 진짜 셸을 실행합니다. 채팅 UI가 아닙니다.

- **PTY 기반 셸 실행**: `portable-pty`로 `$SHELL`(zsh/bash)을 직접 구동. `ls`, `git`, `npm` 등 모든 명령 실행 가능.
- **xterm.js 렌더링**: ANSI 색상, 커서, 스크롤백 5000줄, VT100 에스케이프 완전 지원.
- **실시간 스트리밍**: PTY 출력을 Tauri 이벤트로 스트리밍해 지연 없이 렌더링.
- **Cmd+K AI 오버레이**: 터미널 위에 AI 질문 바를 띄워 셸 컨텍스트와 함께 AI에게 질문.

## 🌌 Spatial Workspace

- **Infinite Canvas**: AI 분석 블록을 화이트보드 위의 노드처럼 배치·연결.
- **3-mode View**: 터미널 ↔ 리스트 ↔ 캔버스를 실시간 전환 (PTY 세션은 유지).
- **Flow-based Dependencies**: 블록 간 논리 흐름을 시각적 연결선으로 표현.

## 🚀 Key Features

- **Real PTY Terminal**: portable-pty 기반 실제 셸 실행 + xterm.js 렌더링. 채팅이 아닌 진짜 터미널.
- **CLI Ghost Text Autocomplete**: `git`, `npm`, `cargo`, `docker`, `kubectl` 등 10개 CLI 툴의 서브커맨드·플래그를 Tab으로 즉시 완성. Fish-shell 스타일 ghost text 오버레이.
- **AI Inline Edit**: `# 대용량 파일 찾기` 처럼 `#`으로 시작하는 자연어 입력을 로컬 AI가 즉시 셸 명령어로 변환. ⚡ 팝업으로 미리보기 후 Tab 한 번으로 확정.
- **Session Persistence**: 앱을 닫아도 탭 구성(분할 방향 포함)을 자동 저장 → 재시작 시 그대로 복원.
- **Hardware-Aware Model Recommendations**: PC 사양(RAM·GPU)을 자동 진단하여 **Qwen2.5-Coder / Phi-3.5 EXL2** 최적 모델 추천.
- **Model Manager**: 추천 EXL2 모델을 HuggingFace에서 직접 다운로드하고 설치된 모델을 관리(삭제).
- **AI Self-Healing Loop**: 터미널 출력에서 에러를 자동 감지 → AI 원인 분석 → 안전도 배지(Safe/Warning/Dangerous)와 함께 수정 커맨드 제안 → 승인 시 PTY 직접 실행.
- **Semantic History Search** (`Ctrl+R`): 임베딩 기반 의미 검색으로 과거 명령어를 자연어로 찾기.
- **AI Commit Message** (`Cmd+Shift+G`): `git diff --cached` 분석 → Conventional Commit 형식 자동 생성.
- **xLLM 실전 최적화**: PD Disaggregation(장문 자동 Q4), Elastic Scheduling(역할별 모델 분리), KV Cache Q4/Q8/FP16 선택.
- **Production-Grade Security**: 파괴적 명령어 감지(Security Gate) 및 AI 생성 UI 완전 격리(Sandbox).
- **Distributed Swarms (libp2p)**: 네트워크 내 다른 LUM 노드들과 협업하는 P2P 지능망 인프라.

## 🖥 Cross-Platform Support

| 플랫폼 | 셸 | 데스크톱 자동화 | 번들 포맷 |
|--------|-----|----------------|----------|
| macOS | `$SHELL` (zsh/bash) | enigo (스크린샷, 마우스/키보드) | `.dmg` |
| Windows | PowerShell → cmd.exe | enigo | `.msi` / `.nsis` |
| Linux (X11) | `$SHELL` (bash/zsh) | enigo | `.deb` / `.AppImage` |
| Linux (Wayland) | `$SHELL` | 미지원 (XWayland 사용 필요) | `.deb` / `.AppImage` |

> **음성 녹음**: `cpal` + Whisper STT 미구현 — 현재 명확한 오류 반환.

## 🏗 Architecture

```
사용자 타이핑
    │
    ▼
xterm.js (onData)
    │  Tauri IPC
    ▼
write_to_pty → SyncSender → 쓰기 스레드 → PTY Master → $SHELL
                                                │
                                    읽기 스레드 (별도 스레드)
                                                │
                                        pty_data 이벤트
                                                │
                                    xterm.js.write() → 화면 출력
```

- **Backend (Rust)**: `commands/terminal.rs` — 채널 기반 PTY (쓰기/리사이즈/읽기 스레드 분리)
- **Frontend (React)**: `TerminalPane.tsx` — xterm.js + FitAddon + ResizeObserver
- **AI Layer**: `Cmd+K` 오버레이로 현재 셸 컨텍스트를 xLLM에 전달
- **Self-Healing**: `HealingPanel.tsx` — 에러 패턴 감지 → `analyze_error` → `verify_command_safety` → PTY 실행

## 🛠 Tech Stack

- **Core**: Rust (Tauri v2), React 19, TypeScript
- **Terminal**: portable-pty (PTY), @xterm/xterm + @xterm/addon-fit
- **UI/UX**: Tailwind CSS v4, @xyflow/react (Infinite Canvas), Lucide Icons
- **AI Engine**: xLLM / TabbyAPI (EXL2), Gemini 1.5 Pro (비전), Burn-LM (On-device WebGPU)

## 📦 Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)
- [TabbyAPI](https://github.com/theroyallab/tabbyAPI) (xLLM 로컬 추론 서버, 기본 포트: 5000, AI 기능 선택)

### Installation

```bash
npm install
npm run tauri dev
```

앱이 실행되면 기본 뷰는 **실제 셸 터미널**입니다. `Cmd+K`로 AI 오버레이를 열 수 있습니다.

## 🏁 2026 Roadmap

- [x] Phase 22: xLLM Migration & Model Manager
- [x] Phase 23: Real PTY Terminal (portable-pty + xterm.js)
- [x] Phase 24: Cross-Platform Polish (platform.rs, Wayland 감지, 번들 타겟 명시화)
- [x] Phase 25: AI Self-Healing Loop (에러 자동 감지 → AI 분석 → 안전도 배지 → PTY 실행)
- [x] Phase 26: Shared RAG Swarm (index_project/search_codebase + gossipsub 피어 간 벡터 검색 공유)
- [x] Phase 27: Multi-Tab PTY (탭 상태 관리, Cmd+T/W 단축키)
- [x] Phase 28: Split Pane Terminal (수평·수직 분할, Cmd+Shift+D/E)
- [x] Phase 29: Command Blocks (OSC 133 Shell Integration, Warp 스타일 블록 UI)
- [x] Phase 30: Semantic History Search (임베딩 기반 히스토리, Ctrl+R 인터셉트)
- [x] Phase 31: AI Commit Message (git diff --cached → xLLM Conventional Commit)
- [x] Phase 32: xLLM 실전 최적화 (PD Disaggregation, Elastic Scheduling, KV Cache Q4/Q8/FP16)
- [x] Phase 33: CLI Ghost Text + Session Persistence (Tab 자동완성 오버레이, 세션 자동 복원)
- [x] Phase 34: AI Inline Edit (`# <자연어>` → ⚡ AI가 셸 명령어로 변환, Tab으로 확정)

---

LUM은 터미널을 단순한 도구가 아닌, AI와 협업하는 개발 공간으로 바꿉니다.
