# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LUM (Local Universal Machine) — Warp 스타일 블록 기반 AI 터미널 에뮬레이터. 로컬 LLM(Ollama)을 사용하여 비용 제로, 개인정보 보호를 목표로 한다.

## Build & Dev Commands

```bash
npm install                  # 프론트엔드 의존성 설치
npm run tauri dev            # 개발 모드 실행 (Rust + Vite HMR)
npm run tauri build          # 프로덕션 빌드
./run.sh                     # Ollama 자동 시작 + 개발 모드 실행 (macOS/Linux)
run.bat                      # Ollama 자동 시작 + 개발 모드 실행 (Windows)
```

Rust 백엔드만 체크:
```bash
cd src-tauri && cargo check
cd src-tauri && cargo build
```

## Architecture

**Tauri v2 앱** — Rust 백엔드 + React/TypeScript 프론트엔드. 커스텀 타이틀바 (decorations: false).

### Backend (`src-tauri/src/lib.rs`)
- **PTY 관리**: `HashMap`을 통해 탭/팬별 독립적인 PTY 세션 관리.
- **AI 연동**: Ollama API 연동. 지능형 프로젝트 요약(RAG-lite) 및 임베딩 생성(`generate_embedding`)을 통한 의미론적 검색 지원.
- **모델 관리**: 모델 다운로드(pull) 및 삭제(delete) 기능. 다운로드 시 실시간 이벤트를 프론트엔드로 스트리밍.
- **주요 커맨드**: `spawn_pty`, `write_to_pty`, `generate_ai_command`, `generate_embedding`, `pull_model`, `delete_model`, `create_file`, `load_config`, `save_config`.

### Frontend (`src/`)
- **App.tsx**: 메인 레이아웃. `react-resizable-panels`로 스플릿 팬 구현. `react-virtuoso`로 가상 스크롤 처리.
- **마크다운 및 시각화**: `react-markdown`을 사용하여 리치 텍스트 렌더링. 출력 데이터(JSON)를 지능적으로 분석하여 표(Table)로 보여주는 **Smart Visualizer** 내장.
- **에디터 및 검색**: `react-simple-code-editor` + `PrismJS`. 퍼지 및 의미론적(Vector Embeddings) 커맨드 팔레트 검색 기능.
- **자동 복구 (Auto-Fix)**: 에러 발생 시 AI가 분석 후 해결 명령어를 자동 실행.
- **영속성**: `.lum_session.json` 및 `.lum_config.json`을 통한 데이터/설정 유지.

## Tech Stack

- **Rust**: Tauri v2, portable-pty, ignore, reqwest, serde, tokio
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, react-resizable-panels, react-virtuoso, react-markdown, PrismJS
- **AI**: Ollama 로컬 API

## Key Conventions

- 한국어 응답, 한국어 주석
- 핵심 스타일은 `index.css`의 CSS 변수 관리, Tailwind는 유틸리티 보조
- AI 워크플로우: AI가 제안한 액션(run, create)을 UI에서 단계별 실행 가능
