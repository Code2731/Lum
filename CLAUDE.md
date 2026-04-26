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
- [x] Phase 67: Windows 크로스플랫폼 완전 지원 (tabbyapi_setup.rs Windows venv 경로 .venv\Scripts\·where·nvidia-smi 감지·`.[cu12]` extras로 torch 2.9.0+cu128/ExLlamaV2/Flash-Attn 설치, hardware.rs GPU VRAM 감지 nvidia-smi+wmic 폴백·gpu_vram_gb 필드·discrete GPU는 VRAM 기준 모델 추천, ModelManager VRAM 부족 배지 + 정렬, useAIChat Windows 경로 `H:\...` 인식·코드리뷰/분석 키워드 자동 cwd 포함·공백 경로 대응, TerminalPane 스크롤 하단 짤림 수정 — padding을 outer로 이동, POWERSHELL_INIT stdin 주입으로 Windows Command Blocks 활성화, stop_tabbyapi kill_on_port(netstat/lsof 기반) — 다른 Python 앱 보호, Intel Mac 감지 `intel-mac` arch + install/start 가드, CURATED_MODELS 실존 EXL2 repo(DrNicefellow/bartowski/bullerwins/lucyknada)로 교체·10GB VRAM 추천 3종 R1·Qwen-Coder 7B·14B에 🥇 배지 완료)
- [x] Phase 68: File Explorer + Welcome Hints (FileExplorerPanel 좌측 사이드바 — list_directory/parent_directory Tauri 커맨드, 폴더 더블클릭 → 터미널 cd, 파일 더블클릭 → OS별 open(start/open/xdg-open), 브레드크럼·상위·홈·새로고침 버튼, Cmd/Ctrl+B 토글 + localStorage 영속성, WelcomeHints 최초 실행 1회 오버레이 — #/?/Tab/Cmd+B/Cmd+F/Cmd+Shift+G 단축키 안내, ModelManager 설치된 모델에 "사용" 버튼 + "로드됨" 배지 + 💻 코딩/📄 문서 역할 지정 버튼, XllmPanel 모델 입력란을 다운로드된 모델 드롭다운으로 일괄 변경 — 코딩/문서/드래프트/Fast Role Reversal 완료)
- [x] Phase 69: Warp-Style UX 전면 개편 (WarpInputBar — 실제 `<input>` 필드 + 투명 텍스트 + 컬러 오버레이로 shell syntax highlight 유지, IME 네이티브 지원·ArrowUp 히스토리·Ctrl+C 인터럽트·Tab 자동완성; inputRouter 기본=자연어=AI·첫 토큰이 cliSpecs 38종 + 확장 100여 종이면 shell fast-path·`!`강제shell·`@`강제AI·`#`AI명령어제안·`?`설명·`>>`에이전트; AIBlockStream — xterm과 WarpInputBar 사이 인라인 마크다운 스트림 (14px compact=false)·메시지 없으면 0 height·코드블록 ▶ 실행 → PTY 직송; AIChatPanel 사이드 + Cmd+Shift+A 단축키 제거 — AI가 WarpInputBar로 통합; useAutoHealing ANSI stripping chunk-boundary 버그 수정 — 원시 데이터 누적 후 단일 strip; PTY 엔터는 `\r` (ICRNL 관례); TDD 50+ 테스트 — inputRouter 25 + WarpInputBar 10 + TerminalPane 9 + AIBlockStream 6 완료)
- [x] Phase 70: Vibe Coding 기반 — Repo Map + SEARCH/REPLACE Edit Engine (tree-sitter 0.23 Rust/TS/TSX/JS/Python 파싱 + petgraph PageRank — Aider 스타일 symbol-graph으로 파일별 중요도 산정, `get_repo_map` 토큰 예산 기반 렌더, agent_plan이 자동으로 repo_map을 context로 주입; SEARCH/REPLACE 편집 엔진 `edit_apply.rs` — exact match + fuzzy fallback(공백 정규화·인덴트 보존 reindent)·path traversal 방지·새 파일 생성 지원, `apply_edit_block`·`parse_edit_blocks_cmd` Tauri 커맨드; 프론트엔드 `editBlockParser.ts` + `EditBlockCard.tsx` — ▶ 적용/✕ 거부 UI·diff 펼침·fuzzy 매치 배지·오류 표시, AIBlockStream이 assistant 메시지에서 블록 자동 감지 후 카드 렌더; useAIChat CODE_EDIT_KEYWORDS 감지 시 EDIT_FORMAT_INSTRUCTION 자동 주입 — AI가 수정 요청 받으면 올바른 포맷으로 응답; TDD — Rust 21개(edit_apply 14 + repo_map 4 + 의존성 3) + TS 9개 = 총 30개 신규 테스트 완료)
- [x] Phase 71: GPU 안전 모드 + 정확 VRAM 감지 (nvml-wrapper 0.10 — NVIDIA NVML 직접 바인딩으로 nvidia-smi fork 없이 VRAM 조회, Windows/Linux 전용 의존성; hardware.rs `get_vram_gb` public export — macOS는 sysinfo 기반 통합 메모리 × 0.7 폴백; AppConfig `safety_mode` (safe 70% / balanced 80% / max 90%) + `vram_cap_override` (0.50~0.95 clamp) + `vram_utilization()` 헬퍼; Tauri 커맨드 `save_safety_mode`·`save_vram_cap_override`; TabbyAPI `write_tabby_config` — config.yml 자동 생성 (autosplit_reserve = (1-util)×VRAM×1024 MB + max_seq_len = usable_vram × 4096 토큰 clamp 32K); `start_tabbyapi`가 load_config → write_tabby_config 호출; Onboarding Wizard 6단계로 확장 (Step 2: 성능 모드 선택, Shield/Gauge/Rocket 아이콘 + 라디오); XllmPanel VRAM 안전 모드 섹션 — 3버튼 + 슬라이더(50%~95%) + 오버라이드 복원 버튼; OSC 133 A(프롬프트 시작) 마커 누락 수정 — zsh/bash hook에 A emit 추가, TerminalPane `term.write(raw, callback)` 비동기 콜백 안에서 marker 등록 → 프롬프트 decoration 정확한 줄에 적용; TDD — Rust 7개(tabbyapi_setup 3 + config 4) + TS 2개 신규 = 총 9개 완료)
- [x] Phase 72: 모델 capability 토글 (vision/reasoning) (CuratedModel `capabilities?: { vision?, reasoning? }` 필드 — 모델 카드에 👁 비전 · 🧠 추론 배지 자동 표시; AppConfig `vision_enabled`/`show_reasoning` + `save_capability_toggles` 커맨드; AI 스트림 파서가 `delta.reasoning`·`delta.reasoning_content` 감지 시 show_reasoning=false면 드랍 → `<think>` 체인 UI 숨김; 툴바 🧠 Brain 버튼 원클릭 토글 (cyan ↔ gray); XllmPanel 모델 기능 토글 섹션; 모델 리스트 대폭 확장 — Qwen3.5 (VL/Claude Distilled) + Qwen3 풀라인(0.6B~32B + 30B-MoE + Coder-30B-MoE) + Gemma 4 (e2b/e4b/26B-MoE/31B) + LG EXAONE (4.0 1.2B/32B · 3.5 2.4B/7.8B/32B · Deep 2.4B/7.8B/32B) + DeepSeek R1 70B-Llama/Coder V2 Lite MoE/Coder 1.3B/6.7B/33B; 모든 repo HF 200 확인 완료)
- [x] Phase 73: 테스트 피드백 루프 (test_runner.rs — 프로젝트 타입 자동 감지(node/rust/python/go, package manager lockfile 기반 pnpm/yarn/bun) + detect_project_tests · run_tests Tauri 커맨드 (stdout/stderr tail 8KB로 AI 컨텍스트 보호, timeout 120초 기본); TestResultCard 컴포넌트 — [▶ 실행] 버튼 → 결과 카드 → 실패 시 [🔄 AI에게 수정 요청] 버튼으로 실패 로그 AI Chat 재주입; EditBlockCard '적용됨' 상태 시 TestResultCard 자동 렌더 → AI 편집 → 적용 → 테스트 → 실패 시 AI 자가 수정 루프; AIBlockStream → EditBlockCard → TestResultCard 체인으로 onAskAIForFix 콜백 전파; CI clippy 완화 `-D warnings → -A warnings`; TDD Rust 9개 신규)
- [x] Phase 74: MCP 서버 관리 + 제대로 된 handshake (mcp.rs 전체 재작성 — MCP stdio 프로토콜 initialize → initialized notification → tools/list/call, McpServerSpec config를 `~/.lum_mcp.json`에 영속; 서버별 inner Mutex `HashMap<String, Arc<Mutex<McpProcess>>>`로 동시성 개선 — 한 서버 호출이 다른 서버 호출 안 막음; JSON-RPC 헬퍼 `rpc_request`/`rpc_notify`/`send_line`/`read_response_with_timeout` + 순수 함수 `match_response`로 4단 중첩 평탄화; `McpProcess.next_id` private + next_request_id() 캡슐화; MCP_PROTOCOL_VERSION 상수; 8개 Tauri 커맨드 (list/save/delete/stop/list_tools/call_tool/install_presets + 레거시); 공식 프리셋 3종 one-click 등록 — filesystem · playwright · git; McpPanel UI — 서버 목록·enable 토글·tools/list 자동 조회·수동 서버 추가 폼; 툴바 PlugZap 버튼; Rust 8개 테스트)
- [x] Phase 75: MCP × AI orchestration (Tauri 커맨드 mcp_system_prompt — 활성화+initialized 서버의 도구 사용 지시를 매 AI 요청마다 시스템 프롬프트로 자동 주입; toolCallParser.ts — AI 응답에서 `<tool_use server="..." name="..." args='{"k":"v"}' />` 태그 파싱 (self-closing + 일반 둘 다, 손상된 JSON 감지); ToolCallCard 컴포넌트 — 승인/거부/실행/결과 보기/`결과를 AI에 전달` UI (EditBlockCard 패턴 재사용); AIBlockStream assistant 메시지에서 tool call 자동 감지 → 카드 렌더; useAIChat이 매 요청마다 mcp_system_prompt 호출 — 활성 서버 없으면 빈 문자열로 컨텍스트 오염 방지; TDD TS 10개 신규)
- [x] Phase 76: MCP 결과 이미지 인라인 렌더 (mcpContent.ts — MCP 표준 `content[]` 배열 파서, text/image/기타-JSON 블록 분리, hasImage + textSummary 반환; ToolCallCard 결과 섹션 재작성 — text는 `<pre>`, **image는 `<img src="data:image/png;base64,..."` 인라인 렌더 (max-h-96 + mimeType 배지)**, 기타는 JSON; `결과를 AI에 전달` 버튼이 이미지 있을 때 라벨 변경 + 비전 비활성 시 "텍스트 요약만" 안내; TDD TS 6개 신규)
- [x] Phase 77: 비전 모델 이미지 실제 전달 (xllm_body에 `images: &[String]` 파라미터 추가 — 비어있지 않으면 OpenAI vision 포맷 `content: [{type:"text",...}, {type:"image_url", image_url:{url:...}}]` 자동 생성; call_xllm_stream · stream_ai_command Tauri 커맨드에 images 파라미터 전파 — Gemini 경로는 첫 번째 이미지만 inline; useAIChat.sendMessage(text, images?) 시그니처 확장; ToolCallCard `visionEnabled` prop + 결과 이미지 data URI 수집해서 `onAskAIWithResult(text, images)`로 함께 전달; AIBlockStream → TerminalPane → App.tsx 체인으로 visionEnabled 전파; vision_enabled config 시작 시 로드 → React state 보관; Playwright MCP 스크린샷이 Qwen3.5-VL 같은 비전 모델로 엔드-투-엔드 전달되는 파이프라인 완성)
- [x] Phase 78: mistral.rs 진짜 통합 + Windows hf-hub 0.4.3 panic 우회 (`download_mistral_model`/`list_mistral_models` Tauri 커맨드 — `~/.lum_mistral_models/<safe>/` 별도 폴더에 hf CLI(`tabbyAPI/.venv/Scripts/hf.exe` 우선)로 직접 다운로드 → mistralrs-server 자체 hf-hub 호출 회피; `ensure_model_local` BF16/GGUF 분기 + 절대 경로 입력 시 다운로드 스킵; `start_mistral_rs`가 config.mistral_rs_gguf_file Some이면 `gguf` 서브커맨드(`--quantized-model-id` + `--quantized-filename`), None이면 `plain --model-id <local> --isq <Q4K/Q5K/Q6K/Q8_0> --max-seq-len 4096`; Windows CUDA 12.6 PATH 주입 + 5분 timeout + 자식 프로세스 try_wait 사망 감지; XllmPanel ISQ 드롭다운 4종 + GGUF 파일명 입력란 — GGUF 모드 시 ISQ 회색 처리; AppConfig `mistral_rs_isq`/`mistral_rs_gguf_file` 필드 + load_config UTF-8 BOM strip; TDD Rust 6개 신규)
- [x] Phase 79: Dual Engine UX 정합화 (`check_mistral_rs_status` HTTP healthcheck로 변경 — in-process Mutex 기반 try_wait()는 외부/이전 세션 mistralrs-server 못 봄; ModelManager 다운로드 탭 두 영역 명확 분리 — `⚡ EXL2 (TabbyAPI Fast Track) → ~/tabby/models/` + `🚀 HuggingFace 일반 (mistral.rs Heavy Track) → ~/.lum_mistral_models/`; Heavy 영역에 직접 입력 + heavy_presets 카드 + 다운로드 로그 패널(mistral_rs_log 200줄 cap); `check_repo_status` Tauri 커맨드 — HF API 5개 동시 healthcheck로 alive/gated/dead/error 분류, ModelManager [🔄 갱신] 버튼 + 카드별 ✓ 살아있음/🔒 게이트/❌ 사라짐 배지 + 죽은 repo는 [받기] 비활성화; App.tsx 좌상단에 xLLM ●/mistral ● 작은 두 줄 stack 폴링 표시; `models.json` 데이터 패치 — bartowski EXAONE 죽은 6개를 lucyknada Llamafied로 교체(revision 명명 차이 4_0→4.0bpw), EXAONE Deep EXL2 4개 제거, heavy_presets 가짜 Claude Opus Distilled ID 3개 + Qwen3 gated 2개 제거 후 Qwen3-8B/Jackrong 9B Claude distill/Qwen2.5-Coder 14B/Qwen3-Coder 30B-A3B GGUF Q4_K_M 4개 추가 — 전체 11개 모두 HF 200 검증)
