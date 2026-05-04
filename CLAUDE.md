# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LUM (Local Universal Machine) — Warp 스타일 블록 기반 AI 터미널 에뮬레이터.
- **UI Review**: [UI_REVIEW.md](./src/UI_REVIEW.md) 참조.
- **AI 백엔드**: mistralrs 0.8.1 (LUM 프로세스에 직접 임베딩, subprocess/HTTP 없음) + Gemini Cloud API 폴백
- **목표**: 비용 제로, 개인정보 보호. Ollama/TabbyAPI 불필요.
- **모델 저장**: `~/.lum_mistral_models/<safe_name>/` (GGUF 또는 BF16)

## Build & Dev Commands

```bash
npm install                          # 프론트엔드 의존성 설치
npm run tauri dev                    # 개발 모드 (Rust + Vite HMR, CPU 추론)
npm run tauri:dev:metal              # macOS Apple Silicon Metal 백엔드 (Xcode Metal Toolchain 필요: xcodebuild -downloadComponent MetalToolchain)
scripts/tauri-dev-cuda.bat           # Windows CUDA 백엔드 (MSVC env 자동 설정)
# Metal Toolchain 없는 macOS는 mlx_lm.server를 외부에서 띄우면 LUM이 xLLM 폴백으로 자동 호출.
# 예: pip install mlx-lm; mlx_lm.server --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit --port 8080
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
- **PTY 관리** (`lib.rs`): `HashMap`으로 탭/팬별 독립 PTY 세션. Phase 115 — `tauri-plugin-global-shortcut` 등록 + Quake Mode 단축키 핸들러(`Cmd/Ctrl+Shift+Space` → 윈도우 toggle + `quake_invoked` emit).
- **임베디드 AI** (`commands/mistralrs_inline.rs`): mistralrs 0.8.1 GGUF 인프로세스 추론. `OnceLock<Mutex<Option<LoadedState>>>` 핫스왑. LoRA 어댑터 지원 (`embed_load_lora`).
- **AI 라우팅** (`commands/ai.rs`): embedded → Ollama → xLLM HTTP → Gemini. `stream_ai_command` / `call_xllm` / `call_ai`. `active_file` 파라미터로 RAG 컨텍스트 자동 주입. Phase 115 — `stream_ai_command` 4분기마다 `ai_route_event` emit (Privacy Ledger 데이터 소스).
- **Ollama** (`commands/ollama.rs`): NDJSON 스트리밍 `/api/chat`. `ollama_base_url` + `ollama_model` config. `check_ollama_status` / `list_ollama_models`.
- **RAG** (`commands/rag.rs`): `index_project` / `search_codebase` / `rag_context_for_file` — 소스코드 청킹 + 임베딩 벡터 검색. `embed_auto`: Ollama → xLLM 폴백 자동 선택.
- **MCP** (`commands/mcp.rs`): stdio JSON-RPC, `~/.lum_mcp.json` 영속. 서버별 inner Mutex 동시성.
- **Worktree Squad** (Phase 116, `commands/squad.rs`): `squad_create / squad_list / squad_remove`. `~/.lum_squads/<id>` worktree + `lum-squad/<id>` 브랜치. 영속 `~/.lum_squads.json`. mistralrs 단일 인스턴스 공유 — N개 squad ReAct 직렬 실행 (다중 인스턴스는 향후).
- **Healing Dataset** (Phase 117, `commands/healing_dataset.rs`): `record_healing_decision / list_healing_dataset / export_healing_dataset / clear_healing_dataset`. `useAutoHealing.handleExecute`=approve, `clearHealing` w/ result=reject. JSONL append-only `~/.lum_healing_dataset.jsonl`. ChatML export(approve only)는 `~/.lum_healing_export.chatml.jsonl` — `mlx-lm lora` / `axolotl`로 로컬 LoRA fine-tune 직접 가능.
- **Persistent Memory Vault** (Phase 118, `commands/recall.rs`): history(명령) / healing(자동치유) / memory(일반) 3소스를 단일 시맨틱 검색 facade로 묶음. `recall_search(query, sources?, since_ms?, until_ms?)` — 쿼리 임베딩(embed_auto) + 소스별 cosine. `recall_forget(ids)` 단건/`recall_forget_before(ts_ms)` 시간기준 일괄 삭제(GDPR-style). `recall_stats` UI 메타정보. healing은 record당 즉석 임베딩 — 200건+ 시 캐싱 follow-up. 클라우드 제품은 데이터 보관정책상 영구 메모리 불가 — LUM의 가장 강한 모트 중 하나.
- **LoRA Forge** (Phase 119, `commands/lora_forge.rs`): Phase 117(수집)→118(검색)→119(학습) 루프의 마지막 고리. 사용자 healing 데이터셋으로 본인 모델을 직접 fine-tune. 외부 CLI(`mlx_lm`/`axolotl`)를 서브프로세스로 호출 — LUM은 오케스트레이션만. `lora_forge_runtimes`(Python `import` 검사로 감지) / `lora_forge_start(opts)`(미명시 dataset은 chatml 자동 export → spawn) / `lora_forge_cancel(run_id)`(`oneshot::Sender`로 kill 신호) / `lora_forge_list` / `lora_forge_remove` / `lora_forge_can_load`(adapter_config.json 존재 시 mistralrs 호환). 영속 `~/.lum_lora_runs.json` + `~/.lum_lora_runs/<id>/`. 진행률은 `lora_forge_progress {run_id, stream, line}` 이벤트로 라이브 emit, 완료 시 `lora_forge_status` + log_tail 영속. 클라우드 제품은 사용자 데이터로 학습 못 함 — Phase 119가 가장 강한 모트.
- **Auto-Learning Loop** (Phase 120, `commands/lora_forge.rs` 확장 + `commands::config::save_auto_lora_settings`): 117·118·119를 단일 자동 파이프라인으로 압축. `record_healing_decision(approve)` 시 `maybe_auto_train`을 fire-and-forget으로 호출 — 미학습 approve 카운트가 threshold 도달하면 `start_internal(is_auto=true, AutoMode)`로 spawn. 성공 시 `auto_train_cursor_ms`(ForgeStore의 root 필드)를 spawn 직전 timestamp로 advance — 다음 트리거 카운트의 기준. `auto_load=true`이고 `adapter_config.json`이 있으면 `try_auto_hot_swap`이 `embed_loaded_info()`로 현재 GGUF 키를 가져와 `embed_load_lora` 자동 호출. 동시 실행 가드는 `cancels()` HashMap이 비었는지 검사. 모든 단계는 `lora_forge_auto_event {phase, run_id?, ...}` 이벤트로 emit (starting/spawned/error/skipped/hot_swapped/hot_swap_failed). 설정은 `auto_lora_*` config 필드 — 기본 disabled(opt-in). 데모 가능한 단일 흐름: "AI가 내 승인을 보고 자동으로 학습한다".
- **Phase 121 — UI 정리·안정화·MCP↔ReAct**: (1) 툴바 16개 → 기본 8 + 고급 8(`AdvancedRow` 팝오버) — `toolbar_show_advanced` config로 인라인/접힘 토글, `save_toolbar_show_advanced` 커맨드. (2) `lora_forge.rs` 안정화: `lock_cancels()`/`lock_logs()` 헬퍼로 `Mutex` poison 회복, `auto_lora_timeout_secs`(기본 4시간) `tokio::select!`에 추가 — 폭주한 학습이 GPU 영구 점유 방지. (3) `react_agent.rs`에 MCP 도구 동적 주입: `mcp::list_enabled_servers()` + `enumerate_mcp_tools()` → `build_system_prompt(&[McpToolEntry])` — 활성 서버의 `tools/list` 결과를 시스템 프롬프트에 평탄 listing(`server/tool — desc`). 신규 `mcp` ACTION이 `app.state::<McpState>()` → `mcp::mcp_call_tool()` 직접 호출. 프롬프트 형식 불변 — ACTION 파서 그대로.
- **LAN LLM Discovery** (Phase 128, `commands/lan_discovery.rs`): UdpSocket connect 트릭으로 로컬 IPv4 + /24 prefix 추출 → 254 호스트 × 5 포트(11434/1234/8080/8081/5000) `buffer_unordered(200)` 동시 probe. TCP 250ms timeout으로 cull → HTTP fingerprint(`/api/tags`=Ollama, `/v1/models`=OpenAI 호환) 후 JSON 모양 검증으로 분류. 자동 스캔 X — 사용자가 XllmPanel에서 "검색" 버튼 트리거. "사용" 클릭 → `save_ollama_settings` 또는 `save_xllm_base_url` 즉시 저장. 자기 자신은 127.0.0.1로도 probe(자기 IP는 제외).
- **Skills 시스템** (Phase 127, `commands/skills.rs`): 사용자가 markdown 절차를 저장하면 다음 ReAct 호출 때 goal 단어와 트리거/이름/설명 overlap top-3을 시스템 프롬프트에 자동 주입. 저장 `~/.lum_skills.json` + `Mutex<Option<SkillStore>>` 캐시. CRUD/search 커맨드 + `find_relevant_skills(goal, limit)` 헬퍼는 react_agent의 `build_system_prompt`에서 호출. Hermes Agent의 agentskills.io와 결이 같음 — LoRA(weight)는 즉시 재사용 안 되지만 skill(prompt-level memo)은 즉시 효과. 두 시스템 직교.
- **Active Learning v2** (Phase 122, R&D §5.1, `commands/healing_dataset.rs`): reject 결정 시 `analyze_failure_reason`이 LLM(`call_xllm`)에 "왜 잘못된 제안인지 60자 한 줄"을 즉석 호출 → `HealingRecord.failure_reason: Option<String>` 필드(serde default + skip_serializing_if Option) 저장. `record_healing_decision`에서 embedding(118)과 reason(122)을 `tokio::join!`으로 병렬 호출 — wall time 두 배 안 됨. 8초 timeout 후 None. 80자 cap. `recall.rs`의 `healing_to_entry`가 reject snippet에 `Why rejected:` 줄과 metadata에 `failure_reason` 포함 — recall 검색 결과에 즉시 노출. UI(`HealingDatasetPanel`): reject 행 펼치면 amber 톤 "거부 사유" 카드. 향후 DPO/preference 데이터셋 export의 데이터 소스.
- **Phase 123 — Code Editing in ReAct** (`commands/react_agent.rs`): "읽고·실행"만 가능했던 ReAct를 "쓰기" 가능 코딩 에이전트로 격상. 신규 도구 3종 — `write_file({path, content, overwrite?})` (overwrite 기본 false, 기존 파일 거부 가드), `apply_patch({path, search, replace})` (search 매칭 0건/2건+ 모두 거부 — 모호성 방지, 1건만 적용), `delete_file({path})`. 모든 쓰기는 `validate_safe_path`로 정규화 — CWD 외부·`.git`/`node_modules`/`target`/`dist`/`build`/`.lum_*` prefix 모두 거부 (LLM 환각으로 시스템 파일 변경 방지). `MAX_STEPS` 15→25 (멀티파일 자가 수정 여유). 시스템 프롬프트에 코딩 워크플로우 명시 — "apply_patch 실패 시 컨텍스트 늘려 재시도", "변경 후 run_tests로 회귀 검증, 실패 시 OBSERVATION 분석 → 추가 apply_patch". 회귀 가드 13건 추가 (path traversal·금지 prefix·overwrite·매칭 모호성·parse_action 신규 형식). 클라우드 코딩 에이전트(Cursor·Claude Code) 대비 격차의 70% 회수.
- **Phase 123 2차 — 자동 백업·되돌리기** (`commands/react_agent.rs`): 모든 ReAct run의 쓰기 변경을 `~/.lum_react_backup/` 디렉터리에 디스크 백업. `react_agent_run` 시작 시 `init_react_backup`으로 기존 백업 dir 통째 삭제 후 재생성 — 단순함 우선, 마지막 1개 run만 보관(동시 실행은 squad worktree로 격리). `track_pre_write(abs_path)`가 쓰기 도구 직전 호출 — 같은 파일 N회 수정해도 첫 원본만 보존(`BackupEntry::Original`/`Created` 두 마커). `react_agent_undo` Tauri 커맨드 신규 → 한 번 호출로 신규 파일 일괄 삭제 + 수정/삭제 파일 일괄 복원 + 백업 dir 폐기. `UndoReport { restored, removed, errors }` 반환. 활성 백업 없으면 도구는 noop으로 동작 — 단위 테스트가 글로벌 state를 건드리지 않고 자동 격리. 신규 `file_change` ReactEvent kind — 쓰기 도구 성공 시 `{path, tool}` emit해 프론트가 변경 파일 리스트 누적. 백업 시나리오 회귀 가드 9건(신규/수정/삭제/혼합/N회/미활성/이중 undo/tracked_changes×2). e2e mock LLM 시뮬레이션 6건(완주·자가복구·반복차단·멀티스텝·즉답·max_steps).
- **Phase 123 3차 — 위험도 분류·사후 승인 UI** (`commands/react_agent.rs` + `hooks/useReactAgent.ts` + `components/ReactAgentPanel.tsx`): 변경 파일을 즉시 시각화·일괄 승인/거부. `ChangeRisk { Low, Medium, High }` enum + `classify_change_risk(rel_path)` — High(Cargo.toml/package.json/tsconfig·`.env*`·`scripts/`·`.github/`), Low(`tests/`·`.test.*`·`.spec.*`·`_test.rs/go/py`·`e2e/`), Medium(기본). 백슬래시·대소문자 정규화. `react_agent_changes` Tauri 커맨드 → `Vec<ChangeInfo { path, rel_path, kind, risk }>` 반환 (Created/Modified/Deleted 자동 분류 — `Original` 백업 후 파일 존재 여부로 modify vs delete 구분). 프론트 `useReactAgent` 훅 확장: `changes`/`undoing`/`undoReport` 상태 + `undo()` 메서드 + `file_change` 이벤트 시 `refreshChanges()` 자동 트리거. `ReactAgentPanel`에 변경 파일 섹션(파일 종류 아이콘 + Low/Med/High 배지 + 상대 경로 + tooltip) + "변경 되돌리기" 버튼(완료/에러/취소 시에만 노출, undoing 중 disabled) + UndoReport 결과 라인. 위험도 회귀 가드 8건(High 매니페스트/env/CI dir, Low 테스트, Medium 일반, 백슬래시·대소문자, 미활성 빈 벡터, kind 분류, 위험도 혼합).
- **Phase 124 — 자연어 코딩 의도 자동 라우팅** (`utils/inputRouter.ts`): Warp 수준 바이브코딩 UX 도입. `detectCodingIntent(text)` — 한/영 동사·명사 결정적 매칭(`수정/추가/구현/리팩터` × `함수/파일/코드/버그`, `fix/add/refactor/write` × `function/file/code/bug`). 동사 ≥1 AND 명사 ≥1 → `routeInput`이 자동 `agent` 반환 → ReAct 루프 자동 발동. 명시적 prefix(`>>`/`!`/`@`/`#`/`?`)·셸 명령은 항상 우선. 영어는 word boundary + plural 폴백(`\bnoun s?\b`), 한국어는 substring(활용 다양). 보수적 디자인 — 동사·명사 한쪽만 있으면 ai 폴백(false positive 회피). 잘못 잡혀도 Phase 123 2차/3차 안전망(자동 백업 + undo + 위험도 분류)이 1초만에 복구. 회귀 가드 24건(한/영 양성 10건 + 음성 5건 + 우선순위 3건 + detectCodingIntent 단위 6건).
- **Phase 125 1차 — Multi-Backend 라우팅 prefix** (`utils/inputRouter.ts`): AI 백엔드들(임베디드 mistral.rs / 외부 Ollama / 외부 xLLM HTTP / Gemini API)은 자원이 다르므로 공존 — 사용자가 작업별로 골라 쓰도록 prefix 도입. `AiBackend = "local" | "ollama" | "xllm" | "gemini"` 타입 + Route의 `ai`/`agent`에 `backend?: AiBackend` 필드. `@local`(=`@embedded`) / `@ollama` / `@xllm` / `@gemini`(=`@cloud`) prefix 파싱 — 첫 토큰이 backend 키워드면 backend 강제 + 나머지 텍스트는 `detectCodingIntent`로 agent/ai 자동 분류. 첫 토큰이 backend 키워드 아니면 기존 `@` 동작(=강제 AI 챗) 보존. backend 미지정 시 기존 fallback chain(embedded → ollama → xllm → gemini)이 그대로. 회귀 가드 9건(4 backend × 양성·음성 + alias + 단독 토글 + 비-backend `@` 보존 + 대소문자). Rust `stream_ai_command` backend 인자 forwarding + UI chip 토글 + 자동 라우팅 정책은 2~3차로 분리.
- **Phase 137-B — query_codebase ReAct 도구** (`commands/react_agent.rs`): ReAct가 코드베이스를 의미 검색할 수 있도록 신규 ACTION `query_codebase({query, limit?})` 추가. 내부적으로 `commands::rag::search_codebase(query, "default", limit)` 호출 — 결과는 score+청크를 truncate(`TOOL_OUTPUT_LIMIT=4000`)해 반환. 인덱스 비어있으면 0건 + `index_project` 안내 메시지 — LLM이 사용자에게 색인 실행 권장하도록 유도. 기존 grep 강제에서 의미 매칭 가능으로 격상 — "auth 관련 함수 찾아" 같은 자연어 질의에 사용. 회귀 가드 4건(도구 등록·요약·truncation·빈 인덱스 안내·query 누락 거부). 테스트 mock은 `CODEBASE_TOOL_MOCK` + `CODEBASE_TEST_LOCK`(병렬 실행 race 직렬화) — 같은 패턴으로 기존 `HEALING_TEST_LOCK` 추가해 `query_healing`/`analyze_failure_reasons` flakiness 함께 fix.
- **Phase 137-A — AST 기반 청킹** (`commands/rag.rs`): RAG 인덱싱 청킹을 600자 고정 → 함수/클래스 단위 격상. 신규 `chunk_by_ast(content, lang)` — tree-sitter Query로 `function_item`/`struct_item`/`class_declaration`/`interface_declaration`/`function_definition` 등을 풀 노드로 캡처(name + chunk 더블 캡처). top-level 외부 영역(use/import/const/comment)은 `module` 청크로 묶음. contain 검사로 메서드는 클래스에 흡수(중복 제거). 큰 함수(>2000자)는 600자 fallback으로 내부 분할 — `name#1`, `name#2` suffix. 비지원 확장자(`.go`/`.java`/`.md` 등) 또는 파싱 실패 시 기존 600자 청킹으로 자동 폴백. 임베딩 키 형식 `[fn verify_token | src/auth.rs]` — 검색 결과에 심볼명 즉시 노출. 회귀 가드 8건(확장자 매핑·Rust top-level·Python 메서드 흡수·TS 인터페이스+클래스·큰 함수 분할·빈 파일·헤더 형식·JS 메서드 흡수). audio 테스트의 글로벌 `voice_state` race도 `AUDIO_TEST_LOCK`으로 함께 fix — 211/211 8회 연속 안정.
- **lum-mcp-server** (`src/bin/lum-mcp-server.rs`): 독립 실행 MCP 서버 바이너리 — 외부 LLM agent가 LUM 도구 직접 호출.
- **Cargo features**: `embedded-ai` — mistralrs 포함 (기본 빌드 제외, ~150MB 절감). Platform별 조건: Windows/Linux = CUDA, macOS = Metal.
- **주요 커맨드**: `spawn_pty`, `write_to_pty`, `stream_ai_command`, `generate_embedding`, `embed_load_gguf`, `embed_load_lora`, `embed_unload`, `load_config`, `save_config`, `index_project`, `search_codebase`, `rag_context_for_file`, `pick_gguf_file`, `pick_model_dir`.

### Frontend (`src/`)
- **App.tsx**: 메인 레이아웃 (~370줄). 커스텀 훅으로 상태 위임.
- **커스텀 훅** (`src/hooks/`):
  - `useTabManager` — 탭/팬 상태 + 세션 저장/복원 (`~/.lum_session.json`, 1초 디바운스)
  - `useAutoHealing` — 터미널 출력 에러 감지 → AI 분석 → 안전도 배지 → PTY 실행
  - `usePanelVisibility` — 모달·사이드패널 show/hide 상태 일괄 관리
  - `useUpdateCheck` — GitHub Releases API 버전 비교 + `tauri-plugin-updater` 기반 업데이트
  - `useCommandBlocks` — OSC 133 파싱, 커맨드 블록 히스토리
  - `useSshProfiles` — SSH 프로필 저장/불러오기 (`~/.lum_ssh_profiles.json`)
  - `usePrivacyLedger` (Phase 115) — `ai_route_event` 누적 → 백엔드별 호출 통계 + on-device 여부
  - `useSquads` (Phase 116) — Worktree Squad CRUD 래퍼 + 새 탭에서 worktree 열기
  - `useRecall` (Phase 118) — recall_search/forget/stats 래퍼 + AI 챗 주입 콜백
  - `useLoraForge` (Phase 119/120) — lora_forge_* 래퍼 + 라이브 로그 버퍼(`liveLogs[run_id]`, 200줄 cap) + 이벤트 구독. Phase 120 확장: `autoStatus` / `autoEvents`(20개 cap) / `saveAutoSettings` / `dismissAutoEvent` + `lora_forge_auto_event` 구독
- **shadcn/ui** (`src/components/ui/`): Button, Dialog, AlertDialog, Command (cmdk), Input, Label, Switch, Tooltip, Textarea, Slider, Select, **ToolbarIconButton** — 모든 모달/폼 컴포넌트가 Radix 기반.
- **PrivacyLedgerBadge** (Phase 115, `src/components/PrivacyLedgerBadge.tsx`): 헤더 좌상단 배지 — `100% On-Device` / `Cloud N%` 표시, 클릭 시 백엔드별 호출수·평균 latency·최근 호출 popover.
- **ToolbarIconButton** (`src/components/ui/toolbar-icon-button.tsx`): 헤더 툴바 전용 — Tooltip + kbd 단축키 힌트 + `aria-pressed` active state + badge dot + `tone` variant(accent/cyan). `ToolbarSeparator`로 그룹 구분.
- **WarpInputBar** (`src/components/WarpInputBar.tsx`): 입력 라우팅 — `!`=shell강제 / `@`=AI강제 / `#`=AI명령어제안 / `?`=설명 / `>>`=에이전트 / 기본=inputRouter 자동 판별.
- **AIBlockStream** (`src/components/AIBlockStream.tsx`): 인라인 마크다운 스트림 렌더. EditBlockCard(SEARCH/REPLACE) + ToolCallCard(MCP) + TestResultCard 체인.
- **ErrorBoundary** (`src/components/ErrorBoundary.tsx`): 터미널·패널 크래시 격리.
- **E2E 테스트** (`e2e/`): Playwright 스모크 테스트 5개. `e2e/setup/tauri-mock.ts`.
- **영속성**: `.lum_session.json`, `.lum_config.json`(Phase 120: `auto_lora_*` 필드 추가), `.lum_code_index.json`, `.lum_ssh_profiles.json`, `.lum_mcp.json`, `.lum_squads.json`, `.lum_healing_dataset.jsonl`, `.lum_lora_runs.json`(Phase 120: `auto_train_cursor_ms` 필드 추가) + `.lum_lora_runs/<id>/`, `.lum_react_backup/`(Phase 123 2차 — ReAct run의 쓰기 변경 백업, 매 run 시작 시 재생성).

## Tech Stack

- **Rust**: Tauri v2, portable-pty, mistralrs 0.8.1, mistralrs-core 0.8.1, tauri-plugin-updater, tauri-plugin-dialog, tauri-plugin-opener, ignore, reqwest, futures-util, nvml-wrapper (Windows/Linux)
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), cmdk, framer-motion, Vitest, Playwright, react-markdown, react-resizable-panels, react-virtuoso, PrismJS
- **AI**: mistralrs 임베디드 GGUF/LoRA (Metal Toolchain 필요한 macOS 환경) + 외부 MLX-LM/Ollama OpenAI 호환 서버(`xllm_base_url` config) + Gemini Cloud API 폴백. macOS에서 Metal Toolchain 없으면 `mlx_lm.server --model <id> --port 8080` 실행 → LUM이 자동 호출.
- **외부 MCP 클라이언트 연동**: `lum-mcp-server` 바이너리(stdio MCP, 7개 도구) — Claude Desktop / CrewAI 등 외부 agent가 LUM 도구 호출 가능 (LUM 본체는 Python 의존성 없음)

## Key Conventions

- 한국어 응답, 한국어 주석 필수.
- TDD 준수: 핵심 로직(`src/utils.ts`, `lib.rs`) 변경 시 테스트 코드 확인.
- AI 워크플로우: AI가 제안한 액션을 UI에서 승인 후 단계별 실행.
- shadcn 컴포넌트: `src/components/ui/`에 추가, LUM 다크 팔레트 (`#0d1117`, `--accent`, `--dim`) 유지.
- mistralrs MoE 모델은 partial offload 미지원 (candle 한계) — dense 모델만 사용.
- SSD(Speculative Decoding): draft 모델은 메인의 1/5 이하 크기여야 가속 효과 있음.
- **UI 디자인 시스템 (Phase 78)**: 헤더 툴바는 `ToolbarIconButton` + `ToolbarSeparator`로 그룹화(파일/AI/시스템). 모든 모달은 shadcn `Dialog` 사용 — 자체 백드롭 금지. 타이포 magic-pixel(`text-[10/11px]`) 대신 Tailwind 토큰(`text-xs`/`text-sm` + `font-medium`/`font-semibold`) 사용. 패널·배너 진입/이탈은 framer-motion `AnimatePresence` + `motion.div`. 모든 인터랙티브 요소에 `focus-visible:ring-1 focus-visible:ring-ring`. 토글 버튼은 `aria-pressed` 필수.
- **Privacy Ledger (Phase 115)**: AI 라우팅을 가시화. `stream_ai_command` 분기마다 `ai_route_event { backend, online, model, prompt_chars, latency_ms, ts_ms }` emit. loopback URL은 offline, 그 외는 online으로 분류 (LAN도 보수적으로 online). 비스트리밍 경로(`call_xllm`/ReAct/git)는 향후 페이즈에서 확장.
- **Quake Mode (Phase 115)**: `tauri-plugin-global-shortcut`. macOS=`Cmd+Shift+Space`, 그 외=`Ctrl+Shift+Space`. 가시+포커스면 hide, 아니면 show+focus+`quake_invoked` emit → 프론트가 AI 바 자동 오픈.
- **Worktree Squad (Phase 116)**: `git worktree add ~/.lum_squads/<id> -b lum-squad/<id> <base>`. `addTab({cwd, title})` 옵션으로 새 탭이 worktree에서 PTY 시작. squad 제거는 `worktree remove --force` + `branch -D` 후 디렉터리 정리.
- **Healing 학습 루프 (Phase 117)**: `useAutoHealing`이 승인/거부 결정마다 `record_healing_decision`. dataset은 append-only JSONL, ChatML export 시 approve만 포함. LUM은 데이터 수집 + 변환만 — 실제 LoRA 학습은 외부 도구(`mlx-lm lora`, `axolotl`)에 위임 (가벼운 핵심 + 학습 인프라 선택의 자유).
- **Persistent Memory Vault (Phase 118)**: 3소스 ID 형식 `<source>:<key>` (history/healing/memory). 쿼리 임베딩 1번 + 각 record 임베딩과 cosine. healing은 record 임베딩 미저장 → 검색 시 즉석 embed_auto. 점수 임계 0.25 (history.rs와 통일). "잊혀질 권리" 액션은 `recall_forget` (단건 ids) / `recall_forget_before` (ts_ms 이전 일괄).
- **LoRA Forge (Phase 119)**: 외부 CLI를 서브프로세스로 orchestrate — LUM은 학습 엔진을 번들링하지 않음(가벼운 핵심 + 사용자가 학습 도구 선택의 자유). 런타임 감지는 `python3 -c "import mlx_lm"` / `import axolotl` (Python 모듈 임포트 가능 여부, `which` 보다 정확). spawn 시 stdout/stderr 줄단위로 `lora_forge_progress` emit + 메모리 ring buffer(80줄) → finalize 시 영속 `log_tail`로 flush. 취소는 `tokio::sync::oneshot` + `child.start_kill()`. mlx-lm 어댑터는 mistralrs LoRA 로더와 형식이 달라 직접 로드 불가(별도 변환 필요) — `lora_forge_can_load`가 `adapter_config.json` 존재 검사로 호환성 판정. axolotl은 `chat_template: chatml`로 healing export와 직접 호환되는 yaml을 자동 생성.
- **Auto-Learning Loop (Phase 120)**: 자동 학습은 **opt-in** — 사용자 명시 활성화 + 베이스 모델 설정 시에만 트리거. cursor 의미론은 "이 ts_ms 이후 approve된 record는 미학습" — 학습 spawn 직전의 `now_ms()`를 candidate로 두고 **성공 완료 시에만** advance(실패는 그대로 → 다음 approve에 다시 시도). hot-swap은 mistralrs LoRA 로더 호환(`adapter_config.json`)일 때만 실행 — mlx-lm 어댑터는 `skipped` 이벤트로 알림(향후 변환기 필요). `start_internal(is_auto, AutoMode)`로 user/auto 분기 — `lora_forge_start`는 `lora_forge_start(...)` Tauri 커맨드만 노출, auto는 `maybe_auto_train`을 통해서만.
- **Code Editing 안전 모델 (Phase 123)**: ReAct 쓰기 도구는 `validate_safe_path`(부모 canonicalize + cwd prefix 검사 + 금지 prefix·`.lum_*` 거부)를 단일 게이트로 사용 — 신규 파일도 검증되도록 부모 디렉터리만 canonicalize하고 파일명은 그대로 결합. `apply_patch`는 search 매칭이 정확히 1회일 때만 적용(0건/2건+ 모두 오류) — LLM이 더 큰 컨텍스트로 재시도하도록 강제. `write_file`은 기본 비파괴 — 기존 파일은 `overwrite=true` 명시 필요.
- **자동 백업·되돌리기 (Phase 123 2차)**: ReAct 쓰기 도구가 `track_pre_write`로 변경 직전 원본을 `~/.lum_react_backup/<rel_path>`에 사본 — 같은 파일 N회 수정해도 첫 원본만 보존. `react_agent_run` 시작 시 `init_react_backup`이 기존 백업 dir을 통째 삭제 후 재생성 → 마지막 1개 run만 보관(동시 실행은 squad worktree로 격리됨). `react_agent_undo`로 한 번에 신규 파일 삭제 + 수정/삭제 파일 복원. **활성 백업이 없으면 `track_pre_write`는 noop** — 단위 테스트는 init 호출 없이 도구만 사용해 글로벌 state 건드리지 않고 격리. 멀티스레드 fs race 방지: `TempDir`이 RAII로 `BACKUP_TEST_LOCK` 잡음 → 모든 fs/도구 테스트 자동 직렬화 (개별 테스트에 lock 추가 안 함).
- **위험도 분류·사후 승인 UI (Phase 123 3차)**: ReAct가 변경한 파일은 항상 적용되되(매 도구마다 승인 X — UX 폭증), 끝난 후 사용자에게 **사후 일괄 표시**. 위험도는 경로 패턴만으로 결정(LLM 호출 없음 — 결정적·즉시): High=빌드/설정 매니페스트·`.env*`·`scripts/`·CI dir, Low=테스트, Medium=기본. `rel_path`는 항상 슬래시 정규화 + 소문자 비교 — Windows/macOS/Linux 동일 분류. 사용자 결정은 단순 — "변경 되돌리기"(전체 일괄) 또는 그대로 두기. 개별 파일 거부는 후속 페이즈(작업당 한 번에 하나씩 결정하지 말 것 — 사용자 인지 부하 방지).

