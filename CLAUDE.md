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
- **App.tsx**: 메인 레이아웃 (~370줄). 커스텀 훅으로 상태를 위임하고 렌더링만 담당.
- **커스텀 훅** (`src/hooks/`):
  - `useTabManager` — 탭/팬 상태 + 세션 저장/복원 (`~/.lum_session.json`, 1초 디바운스)
  - `useAutoHealing` — 터미널 출력 에러 감지 → AI 분석 → 안전도 배지 → PTY 실행
  - `usePanelVisibility` — 모달·사이드패널 show/hide 상태 일괄 관리
  - `useUpdateCheck` — GitHub Releases API 버전 비교, 업데이트 배너
  - `useCommandBlocks` — OSC 133 파싱, 커맨드 블록 히스토리
  - `useTerminalBlocks`, `useAIProcessing`, `useHardwareSpecs` — AI·하드웨어 레이어
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
- [x] Phase 32: xLLM 실전 최적화 (① PD Disaggregation 자동 감지, ② Elastic Scheduling model_for_task, ③ KV Cache Q4/Q8/FP16, switch_xllm_model, XllmPanel UI 완료)
- [x] Phase 33: CLI Ghost Text Autocomplete + Session Persistence (cliSpecs.ts 10개 툴 DB, ghostText.ts findCompletion, TerminalPane Tab 인터셉트 + 오버레이, session.rs save/load_session, App.tsx 1초 디바운스 자동 저장 + 마운트 복원 완료)
- [x] Phase 34: AI Inline Edit (# 프리픽스 → generate_ai_command 600ms 디바운스 → ⚡ AI 팝업 + Tab 확정, modelRef 패턴으로 useEffect 재실행 없이 최신 모델 반영 완료)
- [x] Phase 35: AI Context Awareness (context.rs get_project_context — Node/Rust/Go/Python/Java 자동 감지 + git 여부, get_recent_history 5개 병렬 조회 → context 문자열 구성, generate_ai_command에 주입 완료)
- [x] Phase 36: Auto Update Check (updater.rs check_for_update — GitHub API /releases/latest 조회, semver 비교, App.tsx 업데이트 배너 + 다운로드 링크 완료)
- [x] Refactor: App.tsx 훅 분리 (776줄 → 370줄, useTabManager/useAutoHealing/usePanelVisibility/useUpdateCheck 추출, ai.rs 미사용 model_for_task 제거 완료)
- [x] Phase 37: SSD + Dynamic Sparse Attention + EPD Streaming (xllm_body 헬퍼, draft_model·speculative_ngram, attention_sink_size·top_k_attn, call_xllm_stream SSE 파싱 → xllm_token 이벤트 → streamAICommand → 캔버스 실시간 렌더링 완료, XLLM_TOKEN_EVENT 상수화·drain 최적화·64KB 버퍼 가드 완료)
