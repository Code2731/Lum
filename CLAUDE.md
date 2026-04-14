# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LUM (Local Universal Machine) — Warp 스타일 블록 기반 AI 터미널 에뮬레이터. 로컬 LLM(Ollama)을 사용하여 비용 제로, 개인정보 보호를 목표로 한다.

## Build & Dev Commands

```bash
npm install                  # 프론트엔드 의존성 설치
npm run tauri dev            # 개발 모드 실행 (Rust + Vite HMR)
npm run tauri build          # 프로덕션 빌드
npm run dev                  # Vite 프론트엔드만 실행 (포트 1420)
npm run build                # tsc + vite build (프론트엔드만)
run.bat                      # Ollama 자동 시작 + 개발 모드 실행 (Windows)
./run.sh                     # Ollama 자동 시작 + 개발 모드 실행 (macOS/Linux)
```

Rust 백엔드만 체크:
```bash
cd src-tauri && cargo check
cd src-tauri && cargo build
```

## Architecture

**Tauri v2 앱** — Rust 백엔드 + React/TypeScript 프론트엔드. 커스텀 타이틀바 (decorations: false).

### Backend (`src-tauri/src/lib.rs`)
- 단일 파일에 모든 Tauri 커맨드 정의
- `portable-pty`로 시스템 셸(Windows: powershell, else: zsh) 생성 및 PTY 양방향 통신
- PTY 읽기 스레드가 `pty-data` 이벤트로 프론트엔드에 출력 스트리밍
- `TerminalState`: PTY writer를 `Arc<Mutex<>>` 로 관리
- Ollama REST API (`localhost:11434`) 호출로 AI 기능 제공: 모델 목록, 명령어 생성, 에러 분석
- 주요 커맨드: `get_system_context`, `write_to_pty`, `check_ollama_status`, `list_models`, `generate_ai_command`, `analyze_error`, `save_session`, `load_session`
- Tauri v2 커맨드는 반드시 `Result<T, String>` 반환 (bool 직접 반환 불가)

### Frontend (`src/`)
- `App.tsx`: 메인 컴포넌트. 블록 기반 터미널 UI (Virtuoso 가상 스크롤 적용), 커스텀 타이틀바(드래그/최소화/최대화/닫기), Ollama 상태 표시 및 세션 영속성 관리
- `components/CommandInput.tsx`: 하단 고정 입력 에디터. PrismJS 기반 구문 강조, `/` 접두사로 AI 모드 전환 및 스타일링. 멀티라인, 커맨드 히스토리(↑↓) 지원
- `index.css`: CSS 변수 기반 Warp 테마 + Tailwind CSS v4 보조. 핵심 레이아웃은 순수 CSS
- ANSI 출력 렌더링에 `ansi-to-react` 사용

### 프론트-백 통신 패턴
- 명령어 실행: `invoke("write_to_pty")` → PTY → `pty-data` 이벤트 → `listen()` 으로 수신
- AI 요청: `invoke("generate_ai_command")` / `invoke("analyze_error")` → Ollama API → JSON 응답
- 윈도우 제어: `getCurrentWindow()` → `startDragging()`, `minimize()`, `toggleMaximize()`, `close()`

### Tauri v2 Capabilities (`src-tauri/capabilities/default.json`)
- 윈도우 제어 권한 필수: `allow-start-dragging`, `allow-minimize`, `allow-toggle-maximize`, `allow-close` 등

## Tech Stack

- **Rust**: Tauri v2, portable-pty, reqwest (120s timeout), serde, tokio
- **Frontend**: React 19, TypeScript, Tailwind CSS v4 + @tailwindcss/vite, Vite 7, lucide-react, ansi-to-react
- **AI**: Ollama 로컬 API (llama3, gemma4 등)

## Key Conventions

- 한국어 응답, 한국어 주석
- 핵심 스타일은 `index.css`의 CSS 변수(`--bg`, `--accent` 등)로 관리, Tailwind는 유틸리티 보조
- Tailwind v4 사용 시 반드시 `@tailwindcss/vite` 플러그인을 `vite.config.ts`에 등록
- AI 모드: 입력이 `/`로 시작하면 AI, 아니면 셸 명령어
