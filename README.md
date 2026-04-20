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
- **Hardware-Aware Model Recommendations**: PC 사양(RAM·GPU)을 자동 진단하여 **Qwen2.5-Coder / Phi-3.5 EXL2** 최적 모델 추천.
- **Model Manager**: 추천 EXL2 모델을 HuggingFace에서 직접 다운로드하고 설치된 모델을 관리(삭제).
- **Autonomous Self-Healing**: 터미널 에러를 AI가 분석하고 복구 명령어를 제안하는 루프.
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
- [ ] Phase 25: AI Self-Healing Loop (터미널 출력 → AI 분석 → 자동 수정 제안)
- [ ] Phase 26: Shared RAG Swarm (노드 간 벡터 지식 공유)

---

LUM은 터미널을 단순한 도구가 아닌, AI와 협업하는 개발 공간으로 바꿉니다.
