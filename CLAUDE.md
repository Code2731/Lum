# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LUM (Local Universal Machine) — Warp 스타일 블록 기반 AI 터미널 에뮬레이터.
- **AI 백엔드**: mistralrs 0.8.1 (LUM 프로세스에 직접 임베딩, subprocess/HTTP 없음) + Gemini Cloud API 폴백
- **목표**: 비용 제로, 개인정보 보호. Ollama/TabbyAPI 불필요.
- **모델 저장**: `~/.lum_mistral_models/<safe_name>/` (GGUF 또는 BF16)

## Build & Dev Commands

```bash
npm install                          # 프론트엔드 의존성 설치
npm run tauri dev                    # 개발 모드 (Rust + Vite HMR, CPU 추론)
npm run tauri:dev:metal              # macOS Apple Silicon Metal 백엔드
scripts/tauri-dev-cuda.bat           # Windows CUDA 백엔드 (MSVC env 자동 설정)
npm run tauri build                  # 프로덕션 빌드
npm run tauri build -- --features embedded-ai  # 임베디드 AI 추론 포함 빌드
```

## Testing Commands

```bash
npm test                     # Vitest 실행 (프론트엔드 단위/통합 테스트)
npx playwright test          # E2E 스모크 테스트 (Tauri invoke 모킹, Vite 서버 필요)
npx playwright test --ui     # E2E UI 모드
cd src-tauri && cargo test   # Rust 단위 테스트 실행
```

## Architecture

**Tauri v2 앱** — Rust 백엔드 + React/TypeScript 프론트엔드. 커스텀 타이틀바 (decorations: false).

### Backend (`src-tauri/src/`)
- **PTY 관리** (`lib.rs`): `HashMap`으로 탭/팬별 독립 PTY 세션.
- **임베디드 AI** (`commands/mistralrs_inline.rs`): mistralrs 0.8.1 GGUF 인프로세스 추론. `OnceLock<Mutex<Option<LoadedState>>>` 핫스왑. LoRA 어댑터 지원 (`embed_load_lora`).
- **AI 라우팅** (`commands/ai.rs`): 임베디드 우선 → Gemini 폴백. `stream_ai_command` / `call_xllm`.
- **RAG** (`commands/rag.rs`): `index_project` / `search_codebase` — 소스코드 청킹 + 임베딩 벡터 검색.
- **MCP** (`commands/mcp.rs`): stdio JSON-RPC, `~/.lum_mcp.json` 영속. 서버별 inner Mutex 동시성.
- **lum-mcp-server** (`src/bin/lum-mcp-server.rs`): 독립 실행 MCP 서버 바이너리 — 외부 LLM agent가 LUM 도구 직접 호출.
- **Cargo features**: `embedded-ai` — mistralrs 포함 (기본 빌드 제외, ~150MB 절감). Platform별 조건: Windows/Linux = CUDA, macOS = Metal.
- **주요 커맨드**: `spawn_pty`, `write_to_pty`, `stream_ai_command`, `generate_embedding`, `embed_load_gguf`, `embed_load_lora`, `embed_unload`, `load_config`, `save_config`, `index_project`, `search_codebase`, `pick_gguf_file`, `pick_model_dir`.

### Frontend (`src/`)
- **App.tsx**: 메인 레이아웃 (~370줄). 커스텀 훅으로 상태 위임.
- **커스텀 훅** (`src/hooks/`):
  - `useTabManager` — 탭/팬 상태 + 세션 저장/복원 (`~/.lum_session.json`, 1초 디바운스)
  - `useAutoHealing` — 터미널 출력 에러 감지 → AI 분석 → 안전도 배지 → PTY 실행
  - `usePanelVisibility` — 모달·사이드패널 show/hide 상태 일괄 관리
  - `useUpdateCheck` — GitHub Releases API 버전 비교 + `tauri-plugin-updater` 기반 업데이트
  - `useCommandBlocks` — OSC 133 파싱, 커맨드 블록 히스토리
  - `useSshProfiles` — SSH 프로필 저장/불러오기 (`~/.lum_ssh_profiles.json`)
- **shadcn/ui** (`src/components/ui/`): Button, Dialog, AlertDialog, Command (cmdk), Input, Label, Switch, Tooltip, Textarea, Slider, Select — 모든 모달/폼 컴포넌트가 Radix 기반.
- **WarpInputBar** (`src/components/WarpInputBar.tsx`): 입력 라우팅 — `!`=shell강제 / `@`=AI강제 / `#`=AI명령어제안 / `?`=설명 / `>>`=에이전트 / 기본=inputRouter 자동 판별.
- **AIBlockStream** (`src/components/AIBlockStream.tsx`): 인라인 마크다운 스트림 렌더. EditBlockCard(SEARCH/REPLACE) + ToolCallCard(MCP) + TestResultCard 체인.
- **ErrorBoundary** (`src/components/ErrorBoundary.tsx`): 터미널·패널 크래시 격리.
- **E2E 테스트** (`e2e/`): Playwright 스모크 테스트 5개. `e2e/setup/tauri-mock.ts`.
- **영속성**: `.lum_session.json`, `.lum_config.json`, `.lum_code_index.json`, `.lum_ssh_profiles.json`, `.lum_mcp.json`.

## Tech Stack

- **Rust**: Tauri v2, portable-pty, mistralrs 0.8.1, mistralrs-core 0.8.1, tauri-plugin-updater, tauri-plugin-dialog, tauri-plugin-opener, ignore, reqwest, futures-util, nvml-wrapper (Windows/Linux)
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), cmdk, Vitest, Playwright, react-markdown, react-resizable-panels, react-virtuoso, PrismJS
- **AI**: mistralrs 임베디드 GGUF/LoRA + Gemini Cloud API 폴백
- **Python 에이전트** (`crew/`): CrewAI + lum-mcp-server stdio 연동, Fast(임베딩) 멀티에이전트 전용

## Key Conventions

- 한국어 응답, 한국어 주석 필수.
- TDD 준수: 핵심 로직(`src/utils.ts`, `lib.rs`) 변경 시 테스트 코드 확인.
- AI 워크플로우: AI가 제안한 액션을 UI에서 승인 후 단계별 실행.
- shadcn 컴포넌트: `src/components/ui/`에 추가, LUM 다크 팔레트 (`#0d1117`, `--accent`, `--dim`) 유지.
- mistralrs MoE 모델은 partial offload 미지원 (candle 한계) — dense 모델만 사용.
- SSD(Speculative Decoding): draft 모델은 메인의 1/5 이하 크기여야 가속 효과 있음.

## 현재 상태 요약 (Phase 112 기준)

| 영역 | 상태 |
|------|------|
| PTY 터미널 | 멀티탭 + 스플릿 팬, OSC 133, SSH |
| AI 추론 | mistralrs GGUF 임베딩 + LoRA 어댑터 핫스왑 |
| AI 스트리밍 | `xllm_token` 이벤트, cancel 지원 |
| shadcn/ui | Button/Dialog/AlertDialog/Command/Input/Label/Switch/Tooltip/Textarea/Slider/Select |
| MCP | stdio 프로토콜, lum-mcp-server 바이너리, CrewAI 연동 |
| RAG | index_project / search_codebase / semantic history |
| 모델 관리 | `~/.lum_mistral_models/`, GGUF 파일 피커, 저장 경로 지정 |
| 플랫폼 | Windows (CUDA/NVML), macOS (Metal), Linux (CUDA) |
| 테스트 | Rust 101/0, TS Vitest 131/131, Playwright E2E 5개 |

> 상세 Phase 히스토리는 `git log` 참조.
