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

## Testing Commands

```bash
npm test                     # Vitest 실행 (프론트엔드 단위/통합 테스트)
cd src-tauri && cargo test   # Rust 단위 테스트 실행
```

## Architecture

**Tauri v2 앱** — Rust 백엔드 + React/TypeScript 프론트엔드. 커스텀 타이틀바 (decorations: false).

### Backend (`src-tauri/src/lib.rs`)
- **PTY 관리**: `HashMap`을 통해 탭/팬별 독립적인 PTY 세션 관리.
- **심층 RAG**: `index_project` 및 `search_codebase` 커맨드를 통해 소스코드 청킹 및 임베딩 벡터 검색 지원.
- **AI 연동**: Ollama API. 임베딩 기반 의미론적 검색 및 지능형 프로젝트 요약.
- **모델 관리**: 모델 다운로드(pull) 및 삭제(delete). 스트리밍 방식으로 진행률 공유.
- **주요 커맨드**: `spawn_pty`, `write_to_pty`, `generate_ai_command`, `generate_embedding`, `pull_model`, `delete_model`, `create_file`, `load_config`, `save_config`, `index_project`, `search_codebase`.

### Frontend (`src/`)
- **App.tsx**: 메인 레이아웃 및 상태 관리. 멀티 탭, 스플릿 팬, 커맨드 팔레트(`Cmd+K`), 웹뷰(Visual Context) 통합.
- **에디터**: `react-simple-code-editor` + `PrismJS`. 고스트 텍스트(예측) 및 Tab 자동 완성 기능.
- **UI/UX**: `react-resizable-panels`(스플릿), `react-virtuoso`(가상 스크롤), `react-markdown`(AI 답변).
- **영속성**: `.lum_session.json` 및 `.lum_config.json`, `.lum_code_index.json`을 통한 데이터/설정 유지.

## Tech Stack

- **Rust**: Tauri v2, portable-pty, ignore, reqwest, futures-util
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vitest, Fuse.js, react-markdown, react-resizable-panels, react-virtuoso, PrismJS
- **AI**: Ollama 로컬 API

## Key Conventions

- 한국어 응답, 한국어 주석 필수.
- TDD 준수: 핵심 로직(`src/utils.ts`, `lib.rs`) 변경 시 테스트 코드 확인.
- AI 워크플로우: AI가 제안한 액션을 UI에서 승인 후 단계별 실행.

## 🚀 2026 Future Roadmap
- [x] Phase 10: Agent Swarms (Planner, Coder, Reviewer, Tester 협력 완료)
- [x] Gemini Integration: Gemini 1.5 Flash/Pro 지원 및 GEMINI_SYSTEM_MD 연동 완료
- [x] Phase 11: WebGPU Local AI (Burn-LM/wgpu 인프라, 토크나이저 및 추론 파이프라인 완료)
- [x] Phase 12: Secure Sandbox (정적 명령어 분석 및 차단 시스템 완료)
- [x] Phase 13: MCP Integration (stdio 기반 외부 도구 연동 완료)
- [x] Phase 14: Multi-Modal Visual Shell (데이터 시각화 및 차트 렌더링 완료)
- [x] Phase 15: Semantic Memory (의미 기반 장기 기억 엔진 완료)
- [x] Phase 16: Voice-to-Terminal (음성 인식 인터페이스 인프라 완료)
- [x] Phase 17: Autonomous Self-Healing (에러 분석 및 자율 치유 루프 완료)
- [x] Phase 18: Multi-Agent Distributed Swarms (P2P 분산 군집 인프라 완료)
- [x] Phase 19: AI Native UI Designer (실시간 React/JSX UI 생성 완료)
- [x] Phase 20: Neural Desktop Integration (OS 시각 인지 및 제어 완료)
- [x] Phase 21: Neural Vision & OS Autonomy (자율 피드백 루프, 멀티액션, 시각적 목표 검증 완료)
- [x] Phase 22: xLLM Migration & Model Manager (Ollama → TabbyAPI/ExLlamaV2, 하드웨어 인식 추천, HuggingFace 다운로드/삭제 UI 완료)
- [x] Phase 23: Real PTY Terminal (portable-pty 채널 아키텍처 + xterm.js 렌더링, 실제 셸 실행 검증 완료)
- [x] Phase 24: Cross-Platform Polish (platform.rs 모듈, Wayland 감지 가드, 번들 타겟 명시화, audio stub 정직화 완료)
- [x] Phase 25: AI Self-Healing Loop (터미널 출력 에러 감지 → analyze_error AI 분석 → 수정 커맨드 안전도 배지 + PTY 실행 완료)
- [x] Phase 26: Shared RAG Swarm (index_project/search_codebase/generate_embedding + gossipsub RagQuery/RagResult 피어 간 벡터 검색 공유 완료)
- [x] Phase 27: Multi-Tab PTY (탭 상태 관리, close_pty 커맨드, Cmd+T/W 단축키, CSS show/hide 마운팅, ptyWriteRefs Map 패턴 완료)
- [x] Phase 28: Split Pane Terminal (react-resizable-panels Group/Separator, 수평·수직 분할, activePaneId 포커스 추적, Cmd+Shift+D/E 단축키 완료)
- [x] Phase 29: Command Blocks (OSC 133 Shell Integration, zsh/bash preexec/precmd 훅 주입, useCommandBlocks 파서, CommandBlockBar UI, 리스트 뷰 히스토리 완료)
- [x] Phase 30: Semantic History Search (history.rs 임베딩 저장, search_history/get_recent_history 커맨드, HistorySearch 모달, Ctrl+R 캡처 인터셉트 완료)
- [x] Phase 31: AI Commit Message (git.rs generate_commit_message, git diff --cached + xLLM, CommitPanel UI, Cmd+Shift+G 단축키 완료)
