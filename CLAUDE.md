# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LUM (Local Universal Machine) — Warp 스타일 블록 기반 AI 터미널 에뮬레이터. xLLM(TabbyAPI/ExLlamaV2)을 기본 AI 백엔드로 사용하며, Gemini Cloud API 폴백을 지원한다. 비용 제로, 개인정보 보호를 목표로 한다. Ollama는 불필요하다.

## Build & Dev Commands

```bash
npm install                  # 프론트엔드 의존성 설치
npm run tauri dev            # 개발 모드 실행 (Rust + Vite HMR)
npm run tauri build          # 프로덕션 빌드 (경량 — burn/wgpu 제외)
npm run tauri build -- --features local-ai  # 로컬 AI 추론 포함 빌드
./run.sh                     # (선택) Ollama 자동 시작 + 개발 모드 실행 (macOS/Linux)
run.bat                      # (선택) Ollama 자동 시작 + 개발 모드 실행 (Windows)
```

> **참고**: xLLM(TabbyAPI)만 사용한다면 `npm run tauri dev` 직접 실행으로 충분. run.sh/run.bat은 Ollama 선택적 사용 시 편의 스크립트.

## Testing Commands

```bash
npm test                     # Vitest 실행 (프론트엔드 단위/통합 테스트)
npx playwright test          # E2E 스모크 테스트 (Tauri invoke 모킹, Vite 서버 필요)
npx playwright test --ui     # E2E UI 모드
cd src-tauri && cargo test   # Rust 단위 테스트 실행
```

## Architecture

**Tauri v2 앱** — Rust 백엔드 + React/TypeScript 프론트엔드. 커스텀 타이틀바 (decorations: false).

### Backend (`src-tauri/src/lib.rs`)
- **PTY 관리**: `HashMap`을 통해 탭/팬별 독립적인 PTY 세션 관리.
- **심층 RAG**: `index_project` 및 `search_codebase` 커맨드를 통해 소스코드 청킹 및 임베딩 벡터 검색 지원.
- **AI 연동**: xLLM(TabbyAPI/ExLlamaV2) 기본 + Gemini Cloud API 폴백. 임베딩 기반 의미론적 검색 및 지능형 프로젝트 요약. xLLM 서버 주소는 설정에서 변경 가능 (기본값: `http://127.0.0.1:5000`).
- **모델 관리**: 모델 다운로드(pull) 및 삭제(delete). 스트리밍 방식으로 진행률 공유.
- **주요 커맨드**: `spawn_pty`, `write_to_pty`, `generate_ai_command`, `generate_embedding`, `pull_model`, `delete_model`, `create_file`, `load_config`, `save_config`, `index_project`, `search_codebase`.

### Frontend (`src/`)
- **App.tsx**: 메인 레이아웃 (~370줄). 커스텀 훅으로 상태를 위임하고 렌더링만 담당.
- **커스텀 훅** (`src/hooks/`):
  - `useTabManager` — 탭/팬 상태 + 세션 저장/복원 (`~/.lum_session.json`, 1초 디바운스). `SshProfile` 타입 포함.
  - `useAutoHealing` — 터미널 출력 에러 감지 → AI 분석 → 안전도 배지 → PTY 실행
  - `usePanelVisibility` — 모달·사이드패널 show/hide 상태 일괄 관리
  - `useUpdateCheck` — GitHub Releases API 버전 비교 + `tauri-plugin-updater` 기반 다운로드/설치/재시작
  - `useCommandBlocks` — OSC 133 파싱, 커맨드 블록 히스토리
  - `useSshProfiles` — SSH 프로필 저장/불러오기 (`~/.lum_ssh_profiles.json`)
  - `useTerminalBlocks`, `useAIProcessing`, `useHardwareSpecs` — AI·하드웨어 레이어
- **ErrorBoundary** (`src/components/ErrorBoundary.tsx`): 터미널·패널 크래시 격리. `label` prop으로 위치 식별.
- **E2E 테스트** (`e2e/`): Playwright 스모크 테스트 5개. Tauri invoke 모킹(`e2e/setup/tauri-mock.ts`).
- **UI/UX**: `react-resizable-panels`(스플릿), `react-virtuoso`(가상 스크롤), `react-markdown`(AI 답변).
- **영속성**: `.lum_session.json`, `.lum_config.json`, `.lum_code_index.json`, `.lum_ssh_profiles.json`을 통한 데이터/설정 유지.

## Tech Stack

- **Rust**: Tauri v2, portable-pty, tauri-plugin-updater, tauri-plugin-process, ignore, reqwest, futures-util
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vitest, Playwright, Fuse.js, react-markdown, react-resizable-panels, react-virtuoso, PrismJS
- **AI**: xLLM(TabbyAPI/ExLlamaV2) 로컬 서버, Gemini Cloud API 폴백
- **Cargo Features**: `local-ai` — burn/wgpu/tokenizers/hf-hub 포함 (기본 빌드에서 제외, 배포 바이너리 ~150MB 절감)

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
- [x] Phase 38: First-Run Onboarding Wizard (5단계 모달, 하드웨어 자동 분석, xLLM 서버 확인, 모델 다운로드, onboarding_completed 플래그 완료)
- [x] Phase 39: AI Diff Reviewer (analyze_diff — git diff/--cached + RISK:|PATH:|NOTE: 파싱, 파일별 safe/caution/risk 배지, DiffReviewPanel 아코디언 UI, Cmd+Shift+R 단축키 완료)
- [x] Phase 40: Terminal Themes & Font (5개 빌트인 테마 Dracula/Tokyo Night/One Dark/Solarized/GitHub Dark, 폰트 크기 슬라이더, 폰트 패밀리 선택, useTerminalTheme 훅, TerminalPane 동적 적용, save_terminal_appearance 커맨드, Cmd+, 단축키 완료)
- [x] Phase 41: Quick Actions (즐겨찾기 커맨드 바 — useQuickActions 훅, QuickActionsBar/QuickActionsEditor UI, Cmd+Shift+Q 토글, Cmd+1~9 단축키, save_quick_actions 커맨드, 순서 변경/삭제/편집 완료)
- [x] Phase 42: Smart Tab Rename & Auto-Icon (더블클릭 인라인 rename, OSC 7 cwd 감지 → inferTabIcon 아이콘 자동 변경, Tab.cwd/icon 필드, updateTabCwd 액션 완료)
- [x] Phase 43: Terminal Search (Cmd+F — @xterm/addon-search, 검색 바 오버레이, 대소문자·정규식 토글, Shift+Enter 이전/Enter 다음 네비게이션 완료)
- [x] Phase 44: AI Explain Command (? 프리픽스 → explain_command 500ms 디바운스 → 초록 팝업 설명, xLLM/Gemini 폴백, # = 자연어→커맨드 / ? = 커맨드→설명 대칭 UX 완료)
- [x] Phase 45: Long-Running Command Notifier (useCommandNotifier — 10초 이상 커맨드 완료 시 브라우저 Notification API + 탭 타이틀 플래시 ✅/❌ 완료)
- [x] Phase 46: Workspace Save & Restore (workspace.rs save/list/delete_workspace, WorkspaceTab cwd 저장, WorkspacePanel UI, restoreTabs 액션, TerminalPane cwd prop 전달, Cmd+Shift+S/O 단축키 완료)
- [x] Bug Fix Round 1: TerminalPane useEffect deps 버그 (cwd/onOutput/onReady 를 ref로 분리 → cd 명령 시 PTY 재마운트 방지), SessionTab color/group 필드 누락, explain_command 연산자 우선순위, fork bomb 정규식 `\(\)` 수정, useQuickActions 모듈 스코프 타이머 → useRef 이전, RagPanel 리스너 race condition, XllmPanel setTimeout 누수, rag.rs reqwest 타임아웃 추가 완료
- [x] Bug Fix Round 2: git.rs 한국어/멀티바이트 UTF-8 경계 패닉 (`chars().take(N)` 수정), ai.rs explain_command reqwest 타임아웃 추가, rag.rs/history.rs 하드코딩 XLLM_BASE → config.xllm_url() 동적 조회, CommandPalette/HistorySearch 빈 리스트 ArrowDown 음수 인덱스, WorkspacePanel deleteConfirm 상태 미초기화 완료
- [x] Windows Compat: run.bat Ollama 경로 하드코딩 → %LOCALAPPDATA%/%ProgramFiles%/PATH 자동 탐색, tabIcon.ts Windows 경로 구분자 `\` 정규화, terminal.rs PowerShell(pwsh/powershell) OSC 133 shell integration 추가 완료
- [x] Phase 47: SSH Terminal (spawn_ssh_pty — 시스템 ssh 바이너리를 portable-pty로 실행, write/resize/close 기존 PTY 인프라 재사용, SshConnectModal UI, Cmd+Shift+H 단축키, 탭 바 🔒 SSH 인디케이터 완료)
- [x] Phase 48: CLI Autocomplete DB 확장 (cliSpecs.ts 10개 → 38개: yarn/pnpm/python/pip/docker-compose/terraform/helm/rsync/make/ps/kill/tar/chmod/apt/brew/ping/cat/tail/head/wc/sed/awk/vim/systemctl/journalctl/lsof/netstat/scp 추가 완료)
- [x] Phase 49: Smart Diff Truncation (git.rs smart_truncate_diff — 단순 cut-off 대신 파일 단위 분할 + 균등 예산 배분, 모든 변경 파일을 AI가 커버 가능 완료)
- [x] Phase 50: React ErrorBoundary (ErrorBoundary.tsx 클래스 컴포넌트, TerminalPane 3개 + RagPanel/CommitPanel/XllmPanel/DiffReviewPanel 래핑, label prop 위치 식별, 다시 시도 버튼 완료)
- [x] Phase 51: Playwright E2E 스모크 테스트 (tauri-mock.ts invoke 모킹, smoke.spec.ts 5개 테스트 — 앱 로드/탭 생성/SSH 모달/Escape/커맨드 팔레트, tsconfig.e2e.json 분리 완료)
- [x] Phase 52: SSH 프로필 영속성 (ssh_profiles.rs list/save/delete_ssh_profile, ~/.lum_ssh_profiles.json, useSshProfiles.ts RustSshProfileEntry 브릿지 타입, SshConnectModal 저장된 프로필 목록 + 저장 체크박스 완료)
- [x] Phase 53: 자동 업데이트 설치 (tauri-plugin-updater 연동, install_update 커맨드, update_progress 이벤트 → 진행률 바 UI, app.restart() 자동 재시작, GitHub Actions TAURI_SIGNING_PRIVATE_KEY 서명 완료)
- [x] Phase 54: 성능 최적화 — local-ai Feature Flag (burn/burn-wgpu/wgpu/tokenizers/hf-hub를 optional dep으로 분리, default 빌드에서 ~150MB 절감, hardware.rs GPU 감지 cfg 조건부 컴파일, CI/release.yml Rust 캐시 추가 완료)
- [x] Phase 55: Agentic Task Loop (>> 프리픽스 → agent_plan/agent_observe Tauri 커맨드, useAgentLoop 상태 머신, OSC 133 D 시그널 완료 감지, AgentPanel 위험도 배지 승인/중단 UI 완료)
- [x] Phase 56: AI Chat Sidebar (useAIChat 멀티턴 스트리밍 훅, AIChatPanel 사이드패널 — 최근 명령어+cwd 컨텍스트 자동 주입, react-markdown 코드블록 렌더링, Cmd+Shift+A 토글 완료)
- [x] Phase 57: Smart Environment Auto-Loader (OSC 7 cwd 변경 시 .nvmrc/.python-version/pyproject.toml/Pipfile/Gemfile/package.json 등 10종 감지 → EnvSuggestionToast 슬라이드업 + 실행 버튼, detect_env_files Tauri 커맨드, 600ms 디바운스 완료)
- [x] Phase 58: Script Library (에이전트 태스크 완료 → 스크립트 저장, list/save/delete_script Tauri 커맨드, ScriptLibraryPanel 사이드패널, Cmd+Shift+L 토글, BookOpen 툴바 버튼 완료)
- [x] Phase 59: Notification Center (명령어 완료·에이전트·AI 자가 치유·환경 파일 이벤트 통합 알림 센터, Bell 툴바 버튼 + 미읽음 배지, 드롭다운 패널 완료)
- [x] Phase 60: Smart Paste (2줄 이상 붙여넣기 자동 감지 → SmartPasteModal — 한 번에 실행/단계별 실행/텍스트만 붙여넣기, parseCommandLines 쉘 프롬프트 접두사 제거, PasteGuardModal보다 먼저 처리 완료)
- [x] Phase 61: Right-click Context Menu (터미널 선택 텍스트 우클릭 → 복사/명령어 실행/AI 설명/웹 검색/파일·URL 열기, tauri-plugin-opener 연동, 화면 경계 자동 조정 완료)
- [x] Phase 62: System Monitor (Cmd+Shift+M — CPU/메모리 게이지, 상위 프로세스 6개, 2초 폴링, SysmonState Mutex 관리로 정확한 CPU 측정 완료)
- [x] Phase 63: Apple Silicon MLX-LM 전환 (tabbyapi_setup.rs — cfg!(target_arch="aarch64") 분기, MLX-LM venv 설치/시작/중지, tqdm \r 파이프 블로킹 → Stdio::null()+폴링으로 해결, get_server_model_id() 동적 모델 ID 조회, xllm_body에 stop tokens 추가, AirPlay 포트 충돌 방지 완료)
- [x] Phase 64: AI Chat 코드베이스 인식 (read_path_for_context — 파일/폴더 재귀 읽기 최대 40KB, get_git_context — git status/diff/log 자동 주입, get_staged_diff — 커밋 메시지 생성용, useAIChat 경로 감지·git 키워드 감지·자동 context 주입, AIChatPanel 코드블록 ▶ 실행 버튼 — PTY 직접 전송 완료)
- [x] Phase 65: Model Manager 확장 (MLX_MODELS 4→18개 — 코딩/범용/추론/경량 카테고리, Gemma 3/DeepSeek R1/Phi-4/Mistral/Llama 3.x/Qwen2.5 전계열, 카테고리 필터 버튼, mlx-community·turboderp·HuggingFace 링크 버튼, get_platform_arch 커맨드, XllmPanel 모델 선택 드롭다운, start_tabbyapi model 파라미터 추가 완료)
- [x] Phase 66: XllmPanel 플랫폼 정직화 (NVIDIA 전용 기능에 ⚠ 배지 표시 — KV Cache Q4/Q8·모델 역할 분리·SSD·Sparse Attention이 MLX-LM에서 미동작임을 명시, max_tokens 실제 전송 추가, AI Chat 스크롤 버그 수정 — flex-1 min-h-0 체인, 타이틀바 LUM 로고 제거 완료)
