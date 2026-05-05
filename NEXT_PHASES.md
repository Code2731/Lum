# LUM — 다음 페이즈 고도화 전략 (Phase 129~136)

작성일: 2026-05-04
사후 감사: 2026-05-04 (대부분 이미 구현 완료 상태였음 — 아래 §0.5 참조)
대상 실행자: Codex (또는 후속 Claude 세션)
선행: Phase 128 (LAN LLM Discovery, `958f05b`) 까지 완료, working tree clean.

이 문서는 **2주~1달 내 실행 가능한 단기 전략**입니다. 장기 비전은 `R_AND_D_ITEMS.md` 참조.

> **⚠️ 작성 당시 내부 코드 감사가 부족했음**. 2026-05-04 사후 감사 결과 §0.5에 정리. Phase 129~134는 사실상 모두 done 또는 동등 기능 구현. 새 작업은 §0.5의 ❌ TODO 항목만 의미 있음.

---

## 0.5. 사후 감사 — 페이즈별 실제 구현 상태 (2026-05-04)

| Phase | 명세 | 실제 코드 상태 | 인용 |
|---|---|---|---|
| 129 Plan/Act + auto-approve | 4-5일 명세 | ✅ **DONE** | `react_agent.rs:236` `ReactMode` enum, `:241` `parse_mode`, `:408` `is_plan_blocked_tool`, `:413` `is_whitelisted_in_act`. config.rs:114 `react_tool_whitelist`, :428 `save_react_tool_whitelist`. 프론트 `useReactAgent.ts:189-219` `runPlan/runAct/start`, `ReactAgentPanel.tsx:387` 화이트리스트 저장 UI. |
| 130-A desktop 노출 | 1.5일 명세 | ✅ **DONE** | `react_agent.rs:99` `DESKTOP_PROMPT`, `:386-388` 4도구 라우팅, `:494-548` `run_desktop_tool` enabled gate. config.rs:108 `react_desktop_tools_enabled`, :412 save 커맨드. `ReactAgentPanel.tsx:183-192` 토글 UI. 회귀 가드 4도구 × off/on. |
| 130-B 의도 감지 강화 | 1.5일 명세 | ✅ **DONE** | `inputRouter.ts:142-156` `detectCodingIntent` 가중치 스코어 (0.5 verb + 0.5 noun + 0.3 context, threshold 0.6). 영어 활용형 regex `\b{verb}(s\|ed\|ing)?\b`, 한국어 어미 `CODING_VERB_KO_SUFFIX_FORMS`. |
| 131 MCP 원클릭 번들 | 3-4일 명세 | ✅ **DONE** | `mcp.rs:115` `recommended_servers_catalog`, `:467` `mcp_recommended_servers`, `:474` `mcp_install_recommended`. lib.rs:288-289 등록. `McpPanel.tsx:85` 추천 카드 UI. 회귀 가드 `:717` `recommended_servers_7개_노출`. |
| 132 SKILL.md 표준 | 3일 명세 | ✅ **DONE** | `skills.rs:38-42` `when_to_use/quick_reference/procedure/pitfalls/verification` 5섹션, `:193` `split_frontmatter`, `:246` `parse_frontmatter_yaml`, `:295` 헤더 alias 매핑. |
| 133 Reflexion 1턴 | 1주 명세 | ✅ **DONE** | `react_agent.rs:301` `run_reflexion`, `:1545` config 토글, `:1588/:1625/:1710` 통합. config.rs:111 `react_reflexion_enabled`. |
| 134 Healing 자연어 | 3-4일 명세 | ✅ **DONE** | `react_agent.rs:381` `query_healing` + `analyze_failure_reasons` 도구. `inputRouter.ts:122-130,160-167,236` `HEALING_INTENT_KO/EN` + `detectHealingIntent` + 라우팅. `HealingDatasetPanel.tsx:182-186` reject 카드 amber `failure_reason` 노출. |
| 135 Voice 입력 | 1~1.5주 명세 (cpal+whisper-rs) | 🟡 **PARTIAL** | `audio.rs:83-179` 외부 whisper(LUM_VOICE_STOP_CMD/`~/.lum_whisper/last_transcript.txt`) 호출. 임베디드 cpal+whisper-rs는 미구현 — 디자인이 외부 위임으로 의도적으로 갈라짐(가벼운 핵심 + 사용자가 STT 도구 선택). 명세대로 가려면 신규 페이즈 필요. |
| 136 Magentic 2-ledger | 2-3주 명세 | 🟡 **PARTIAL (136-A)** | `ProgressLedger` in `react_agent.rs` — action_counts/key_facts/stuck_total. L1(첫반복: 힌트주입+계속) / L2(3회+: 강제ANSWER). outer TaskLedger loop/orchestrator.rs는 미구현. |

**결론**: NEXT_PHASES.md(자연어 표면)는 작성 당시 거의 다 done이었음. 외부 리서치는 정확했지만 내부 감사 부족 — Codex 핸드오프 가치는 **136(Magentic) + 135 임베디드 STT** 두 항목뿐. 나머지는 **이미 done이므로 새로 구현 금지**. Code Intelligence 축은 `NEXT_PHASES_CODE_INTEL.md` 별도 문서 참조 — 그쪽이 실제 미완 항목 다수.

---

## 0. 진단 — 가장 큰 격차

사용자 핵심 불만: *"자연어로 뭐 하자 뭐 하자 하면 할 줄 아는 게 없다."*

리서치 두 갈래(외부 2026 시장 + 내부 코드베이스 감사)에서 같은 결론:

| 측정점 | 현재 LUM | 2026 시장 표준 | 격차 |
|---|---|---|---|
| 코딩 의도 감지 | AND 논리, ~75% | embedding/intent 분류기 | 중-높음 |
| 자연어→도구 surface | ReAct 10개 + MCP 동적 | Claude Code ~40개, MCP 12k+ 생태계 | 높음 |
| 실행 모델 | ReAct 단일 루프 | Plan/Act 분리 + 도구단위 auto-approve | 높음 |
| 음성 입력 | `audio.rs` stub만 | Anthropic·OpenAI 2026-03 출하 | 높음 |
| 데스크톱 제어 | 구현 O, 프롬프트 노출 ✗ | LLM이 즉시 호출 | **즉시 닫힘** |
| Skill 매칭 | HashSet 교집합 | embedding cosine + SKILL.md 표준 | 중간 |
| Self-critique | 없음 | Reflexion 1턴 (HumanEval +11pp) | 중간 |
| Long-horizon 안정성 | 단일 ReAct, stuck 회복 약함 | Magentic 2-ledger 패턴 | 큼 (장기) |

**가장 충격적 발견**: `src-tauri/src/desktop.rs:32-142` 에 `capture_screen` / `simulate_mouse` / `simulate_keyboard` / `simulate_click` / `simulate_scroll` / `simulate_key_combo` 6종이 **이미 구현되어 Tauri 커맨드로 등록**되어 있는데, ReAct 시스템 프롬프트(`src-tauri/src/commands/react_agent.rs:71-84`)에는 **0줄도 문서화되지 않음** → LLM은 존재 자체를 모름. 1시간짜리 작업으로 즉시 닫히는 격차.

---

## 1. 전략 — 2단계

### Stage A — 테이블 스테이크 (1.5~2주, Phase 129~132)

**목적**: 모트와 무관하게 2026 시장 기본기를 따라잡음. "자연어 → 도구 실행" brittleness를 가장 빨리 줄임.

### Stage B — LUM 고유 모트 surface 화 (2~3주, Phase 133~136)

**목적**: 클라우드 제품이 절대 못 하는 것(개인 데이터 기반 학습, 영구 메모리, 임베디드 추론)을 자연어 1급으로 노출.

---

## 2. Phase 129 — Plan/Act 분리 + 도구 단위 auto-approve (4-5일) ✅ DONE

**근거**: Cline 3.x가 사실상 표준화한 패턴. Phase 123 3차의 사후 위험도 분류 + Phase 123 2차의 자동 백업이 이미 있어서 절반은 done.

### 변경 범위
- `src-tauri/src/commands/react_agent.rs`
  - `ReactMode` enum 추가: `Plan` (readonly only) / `Act` (full tools).
  - `run` 함수에 `mode` 파라미터 추가. `Plan` 모드면 `write_file`/`apply_patch`/`delete_file`/`shell` 호출 시 즉시 거부 + "approve plan first" 메시지.
  - 기본 흐름: `Plan` → 사용자 승인 → 같은 goal로 `Act` 재실행 (백엔드는 멱등, plan 결과만 표시).
- `src-tauri/src/commands/config.rs`
  - 신규 필드: `react_tool_whitelist: Option<Vec<String>>` (도구 이름 화이트리스트, None=수동 승인 필수)
  - 신규 커맨드: `save_react_tool_whitelist(whitelist: Vec<String>)`
- `src/hooks/useReactAgent.ts`
  - `runPlan(goal)` / `runAct(goal, plan_id)` 두 메서드 분리.
- `src/components/ReactAgentPanel.tsx`
  - Plan 결과를 단계 카드로 표시 → "이 도구들 자동 승인" 토글 → "실행" 버튼.

### 수용 기준
- [ ] Plan 모드에서 쓰기 도구 호출 시 ACTION 파서 단계에서 거부.
- [ ] 도구 화이트리스트가 활성이면 해당 도구는 사용자 확인 없이 진행, 외 도구는 차단.
- [ ] `cargo test` 통과 (회귀 가드: Plan 모드 쓰기 거부, 화이트리스트 적용/우회).
- [ ] UI에서 plan → 승인 → execute 단일 흐름 동작 (Tauri mock E2E 1건).

### 주의
- Phase 123 2차 자동 백업과 충돌 없음 — Plan 모드는 쓰기 0건이라 백업 entry 0.
- Phase 116 Worktree Squad와 직교 — Squad 안에서도 Plan/Act 그대로 동작.

---

## 3. Phase 130 — desktop 도구 노출 + 코딩 의도 감지 강화 (2-3일) ✅ DONE (130-A + 130-B 모두)

**근거**: 가장 ROI 높은 페이즈 — 1시간짜리 desktop 노출이 즉시 UI 자동화 활성화.

### 3-A. desktop 도구 ReAct 노출 (1.5일)

**변경 범위**:
- `src-tauri/src/commands/react_agent.rs`
  - `BASE_PROMPT` 에 desktop 섹션 추가:
    ```
    - screenshot — 화면 PNG 캡처 (UI 검증/자동화에 사용)
    - click(x, y, button?) — 마우스 클릭
    - type(text) — 키보드 입력
    - key_combo(keys) — Cmd/Ctrl/Alt + 키 조합
    ```
  - `parse_action` 에 4개 액션 추가 → `desktop::capture_screen` / `simulate_click` / `simulate_keyboard` / `simulate_key_combo` 직접 호출.
  - 결과는 base64 PNG는 4000자 cap 적용 후 truncate (기존 `truncate` fn 재사용).
- 위험도: `validate_safe_path` 같은 게이트 없음 — 이건 시스템 전역 영향이라 **사용자 명시 토글 필요**.
- `commands/config.rs`: `react_desktop_tools_enabled: bool` (기본 `false`).

**수용 기준**:
- [ ] 토글 off면 desktop 도구 호출 시 "데스크톱 제어가 비활성화됨" 메시지로 거부.
- [ ] 토글 on에서 "현재 화면 스크린샷 찍어줘" → `screenshot` ACTION 발화 + 결과 truncate.
- [ ] 회귀 가드 4건 (각 도구 토글 off 거부 + 토글 on 호출 성공).

### 3-B. 코딩 의도 감지 정확도 개선 (1.5일)

**변경 범위**:
- `src/utils/inputRouter.ts:129-135`
  - 현재: 동사≥1 AND 명사≥1 boolean.
  - 변경: 가중치 스코어 — 동사 0.5 + 명사 0.5 + 컨텍스트 단어(`버그`/`에러`/`테스트`/`함수`/`파일`) 0.3 + threshold 0.6.
  - 한국어 활용형 보강: `추가해/추가하자/추가한다/추가하면` 등 동사 어미 5종 substring fallback.
  - 영어 plural/3인칭/과거 보강: `\b{verb}(s|ed|ing)?\b`.
- 회귀 가드 보강:
  - 양성 추가: "함수 추가해", "added a function", "리팩터링하자", "fix this bug".
  - 음성 보존: "함수 설명해줘", "explain this function".

**수용 기준**:
- [ ] Phase 124 24건 회귀 테스트 전부 통과.
- [ ] 신규 양성 8건 + 음성 4건 추가, 전체 통과.
- [ ] 통계: 라우터 정확도 자체 측정 스크립트(50문장 sample) ≥90%.

---

## 4. Phase 131 — MCP 원클릭 번들 (3-4일) ✅ DONE

**근거**: MCP 12k+ 서버 생태계인데 현재 LUM은 사용자가 `~/.lum_mcp.json` 직접 편집. 진입 장벽이 큼.

### 변경 범위
- `src-tauri/src/mcp.rs`
  - 신규 `recommended_servers()` 함수 — 7종 메타 반환:
    1. **GitHub** (`@modelcontextprotocol/server-github`) — issue/PR/repo
    2. **Filesystem** (`@modelcontextprotocol/server-filesystem`) — 파일 시스템
    3. **Git** (`@modelcontextprotocol/server-git`) — git 명령
    4. **Context7** — 문서 동기화/메모리
    5. **Playwright** (`@playwright/mcp`) — 브라우저 자동화
    6. **Postgres** (`@modelcontextprotocol/server-postgres`) — DB 쿼리
    7. **Fetch** (`@modelcontextprotocol/server-fetch`) — HTTP fetch
  - 신규 커맨드: `mcp_install_recommended(name)` — npm/pip로 설치 + `~/.lum_mcp.json` entry 추가 + handshake 검증.
- `src/components/McpManagerPanel.tsx` (또는 신규 `McpRecommendedSection.tsx`)
  - 7개 카드 UI — 이름/설명/필요 토큰(env var)/설치 버튼.
  - 설치 후 즉시 enable + tools/list 결과 표시.

### 수용 기준
- [ ] 7개 서버 메타가 정확 (npm 패키지명 검증 — 2026-05 기준 존재 확인).
- [ ] 설치 실패(npm 없음/네트워크 X) 시 명확한 에러 메시지.
- [ ] 설치 성공 → `mcp_list_tools` 호출 → tools 1개 이상 반환 검증.
- [ ] 환경 변수가 필요한 서버(GitHub token, Postgres URL)는 입력 prompt UI 제공.

### 주의
- LUM 본체는 Python/Node 의존성 없음 — npm/pip는 **사용자 시스템에서 spawn**. PATH 검증 필수.
- 토큰 저장은 `~/.lum_mcp.json` 평문이 아닌 OS keychain 권장 (macOS Keychain / Windows Credential Manager). Phase 131에서는 평문도 허용하되 후속 페이즈에서 keychain 통합.

---

## 5. Phase 132 — agentskills.io 표준 호환 SKILL.md (3일) ✅ DONE

**근거**: 현재 Phase 127 Skills는 자유 markdown — Hermes Agent의 agentskills.io 표준과 메커니즘은 같지만 형식 비호환. 표준 호환 시 Hermes/Claude Code 스킬 hub를 그대로 import 가능.

### 변경 범위
- `src-tauri/src/commands/skills.rs`
  - `Skill` 구조 확장:
    ```rust
    pub struct Skill {
        pub id: String,
        pub name: String,
        pub description: String,        // YAML frontmatter
        pub triggers: Vec<String>,
        pub when_to_use: Option<String>,    // 신규: 5섹션
        pub quick_reference: Option<String>,
        pub procedure: String,              // 기존 body 자리
        pub pitfalls: Option<String>,
        pub verification: Option<String>,
        ...
    }
    ```
  - `parse_skill_md(s: &str)` — YAML frontmatter 파싱 + `## When to Use` / `## Quick Reference` / `## Procedure` / `## Pitfalls` / `## Verification` 헤더 분할.
  - `skill_import_url(url)` 신규 — URL drop-in (Hermes 패턴).
- `src-tauri/src/commands/skills.rs:92-111` 매칭 알고리즘
  - 토큰 교집합 → `embed_auto`(Phase 118) 임베딩 cosine 유사도 (top-3).
  - `recall.rs`의 cosine 인프라 재사용.
- `src/components/SkillsPanel.tsx`
  - 5섹션 폼 UI (간단한 collapsible).
  - "URL 가져오기" 입력 + 임포트 버튼.

### 수용 기준
- [ ] 기존 자유 markdown skill은 마이그레이션: `procedure` 필드에 통째로 들어가고 다른 섹션은 `None`.
- [ ] Hermes 표준 SKILL.md 샘플 2개를 임포트 → 5섹션이 정확 분리.
- [ ] 매칭 결과: "Kubernetes 배포 방법" → "K8s 디플로이" skill 매칭 (embedding으로 가능, 기존 토큰화로 불가).
- [ ] 회귀 가드: 기존 4건 전부 통과 + 신규 임베딩 매칭 2건.

### 주의
- 임베딩 캐싱 — skill description은 자주 안 바뀌니 첫 매칭 시 임베딩 계산 후 store에 저장 (`description_embedding: Option<Vec<f32>>`).
- 200개+ skill 시 매번 cosine N개 계산은 비용 — 스레시홀드 0.4 사전 cull 권장.

---

## 6. Phase 133 — Reflexion 1턴 self-critique (1주) ✅ DONE

**근거**: ReAct 마지막에 "goal 달성? 회귀 위험?" 자기검토 1회. HumanEval +11pp 보고된 표준 기법. Phase 122 `failure_reason` 인프라 그대로 재사용.

### 변경 범위
- `src-tauri/src/commands/react_agent.rs`
  - `MAX_STEPS` 도달 또는 `FINAL` ACTION 직전에 `reflect_step` 1회 추가:
    1. 지금까지의 thought/action/observation 시퀀스를 컴팩션
    2. LLM에 "이 결과가 goal을 달성했는가? 회귀 위험은? 60자 한 줄"
    3. 만약 "fail" 또는 "risk high" 응답이면 추가 1턴 허용 (`MAX_STEPS+1`까지)
  - 8초 timeout, 응답 없으면 그냥 종료 (Phase 122 패턴 재사용).
- `commands/config.rs`: `react_reflexion_enabled: bool` (기본 `true`).

### 수용 기준
- [ ] 정상 case: reflect 호출 후 "ok" 응답 → 그대로 FINAL.
- [ ] 위험 감지: reflect 응답이 "fail"이면 추가 1턴 진입 (총 단계 +1).
- [ ] 토글 off면 reflect 단계 skip.
- [ ] 회귀 가드 3건.

---

## 7. Phase 134 — Healing 자연어 surface (3-4일) ✅ DONE

**근거**: Phase 122 `failure_reason` 필드는 저장되지만 UI에 노출 0. Phase 118 recall_search는 healing을 검색하지만 수동. "내 거부 케이스 보여줘" 같은 자연어로 직접 호출 가능해야 LUM 학습 데이터를 사용자가 큐레이션할 수 있음 — 진짜 LUM 모트.

### 변경 범위
- `src-tauri/src/commands/react_agent.rs`
  - 신규 도구 `query_healing(query)`: 내부적으로 `recall_search(query, sources=["healing"])`.
  - 신규 도구 `analyze_failure_reasons(since_days?)`: 최근 N일 reject 케이스의 `failure_reason` 클러스터링 (간단히 빈도 top-5).
- `src/components/HealingDatasetPanel.tsx`
  - reject 카드 펼침에 `failure_reason` amber 카드 (이미 Phase 122 명세에 있는데 실제 노출 확인 필요 — 코드 검증).
- `src/utils/inputRouter.ts`
  - 신규 의도 키워드: "거부 케이스" / "실패 패턴" / "내가 거부한" / "rejected" → agent로 라우팅 (또는 healing 패널 직접 오픈).

### 수용 기준
- [ ] "최근 거부한 케이스 3개 보여줘" → ReAct가 `query_healing` 호출 → 결과 표시.
- [ ] HealingDatasetPanel에서 failure_reason 표시 검증.
- [ ] 회귀 가드 3건.

---

## 8. Phase 135 — Voice 입력 (chunk 기반) (1~1.5주) 🟡 PARTIAL — 외부 whisper 호출만 구현, 임베디드 cpal+whisper-rs 미구현 (디자인 의도적 분기)

**근거**: 2026-03 Anthropic·OpenAI 코딩 agent voice mode 출하. LUM은 `audio.rs:1-10` stub만 있음.

### 변경 범위
- `src-tauri/src/audio.rs`
  - stub 제거 → `cpal`로 마이크 캡처 + `whisper-rs` 또는 외부 `whisper.cpp` 서브프로세스로 STT.
  - `start_voice_recording` / `stop_voice_recording` 실제 구현, `voice_transcript` 이벤트 emit.
- `src/components/WarpInputBar.tsx`
  - 마이크 토글 버튼 → `voice_transcript` 이벤트 수신 시 입력창에 inject.
- 첫 모델 선택: `whisper.cpp ggml-base.en` (~150MB) — 기본 영어, 한국어는 `ggml-base` (multi-language).

### 수용 기준
- [ ] 마이크 토글 ON → 5초 발화 → WarpInputBar에 텍스트 자동 입력.
- [ ] 토글 OFF → 마이크 입력 차단.
- [ ] STT 실패 시 명확한 에러 (모델 미설치/마이크 권한 거부).
- [ ] 회귀 가드 — 단위 테스트는 STT mock 필요 (실 마이크 없이).

### 주의
- Whisper streaming은 진정한 streaming 아님 (chunk 기반). 코딩 agent UX는 "발화 끝남" 감지 후 일괄 변환이 적합 — VAD(voice activity detection)로 silence 0.8초 감지 후 chunk 종료.
- 모델 다운로드는 `~/.lum_whisper/` 신규 디렉터리, 첫 사용 시 lazy.

---

## 9. Phase 136 — Magentic식 2-ledger Orchestrator (2-3주, 큰 투자) ❌ TODO

**근거**: 단일 ReAct는 long-horizon (20+ 단계) 작업에서 stuck-loop 발생. Magentic-One의 outer(task ledger) + inner(progress ledger) 패턴이 2026 표준.

### 변경 범위
- 신규 파일: `src-tauri/src/commands/orchestrator.rs`
  - `TaskLedger { facts, guesses, plan: Vec<SubTask> }` 외부 루프
  - `ProgressLedger { current_step, owner, last_observation, stuck_count }` 내부 루프
  - stuck_count ≥ 3이면 outer로 escalate → plan 재생성
- 기존 ReAct는 변경 없음 — Orchestrator가 ReAct를 specialist로 호출.
- Phase 116 Squad 인프라가 specialist 분리에 그대로 매핑 — 각 SubTask는 별 worktree에서 실행 가능.

### 수용 기준
- [ ] 20+ 단계 작업에서 stuck-loop (같은 ACTION 3회 반복) 자동 감지 + 재plan.
- [ ] 단순 작업(< 5 단계)은 Orchestrator 우회하고 직접 ReAct (overhead 회피).
- [ ] 회귀 가드 5건 + e2e long-horizon 시나리오 1건.

### 주의
- 2-3주 큰 투자 — Stage A 4개 페이즈 끝난 뒤 사용자 피드백 받고 진입할지 결정 권장.

---

## 10. 하지 말 것 (적극 권고)

- **`src-tauri/src/swarm.rs` 활성화** — libp2p P2P 코드는 2026 시점 활성 사용자 패턴 0. 프론트가 호출 안 함. Phase 137쯤 deprecate 후보 (즉시 제거하지 말고 코드만 남겨두기).
- **CrewAI/Hermes Agent 흉내 (게이트웨이/headless 서버)** — LUM 정체성(터미널)과 직교. `lum-mcp-server` 바이너리로 외부 agent 연동은 충분.
- **자체 학습 엔진 번들 (mlx-lm/axolotl 흡수)** — Phase 119 LoRA Forge가 외부 CLI orchestration인 게 LUM의 가벼움. 흡수하면 ~수백MB 추가 + 사용자 학습 도구 선택의 자유 상실.
- **클라우드 동기화/계정 시스템** — privacy-first 정체성과 정면 충돌.

---

## 11. 우선순위 추천

**가장 ROI 높은 4건**: Phase **129(Plan/Act) + 130(desktop+intent) + 131(MCP 번들) + 132(SKILL.md 표준)**.

합쳐 1.5~2주, 자연어 → 도구 surface 격차의 *80%* 닫음.

**가장 작게 시작 가능한 Phase**: **130-A** (desktop 도구 노출, 1시간~1일). 즉시 효과 가시화.

**의존 관계**:
- 129/130/131/132는 서로 직교 → 병렬 가능.
- 133은 129 후 진입 권장 (Plan 모드와 reflect의 UX 일관성).
- 134는 122/118 인프라가 이미 있어 독립.
- 135는 독립 (voice는 다른 파이프라인).
- 136은 129 + 133 후 진입 권장.

---

## 12. Codex 핸드오프 가이드

이 문서를 받은 실행자가 작업을 시작할 때:

1. **현재 상태 확인**: `git log --oneline | head -10` — Phase 128 (`958f05b`)이 최신인지.
2. **선택**: 위 Phase 중 하나 선택 (130-A 권장 시작점).
3. **변경 범위 검증**: 해당 Phase의 "변경 범위" 섹션의 파일들을 `Read` 로 확인 — 명세와 실제 코드가 일치하는지 (코드는 살아있어 drift 가능).
4. **회귀 가드 먼저**: 수용 기준의 회귀 테스트를 *코드 작성 전* 작성 (TDD).
5. **단일 Phase = 단일 커밋**: 한 번에 하나의 Phase만 완수, 커밋 메시지는 `feat: Phase 12X — 제목 (요약)` 패턴.
6. **CLAUDE.md 갱신 필수**: 새 Phase 완료 시 `Backend` 또는 `Frontend` 섹션에 항목 추가 + `Key Conventions`에 새 규약 명시.
7. **회귀 가드 통과 검증**: `cd src-tauri && cargo test` + `npm test` 둘 다 green.

---

## 13. 부록 — 리서치 출처

외부 리서치 (2026-05 시점 확인):
- Hermes Agent docs (Nous Research)
- Cline 3.x Plan/Act docs
- Magentic-One (Microsoft Research, arxiv 2411.04468)
- MCP 생태계 (mcpmanager.ai, fastmcp.me)
- Qwen3-Coder / Codestral 25.01 / DeepSeek-Coder-V3
- Whisper streaming alternatives (brilo.ai)
- Reflexion / Plan-and-Execute / Tree-of-Thought 패턴

내부 감사 (2026-05 LUM 코드베이스):
- `src/utils/inputRouter.ts:129-210` — 라우팅 6단계
- `src-tauri/src/commands/react_agent.rs:71-284` — ReAct 도구 + 프롬프트
- `src-tauri/src/commands/skills.rs:92-135` — Skills 매칭
- `src-tauri/src/desktop.rs:32-142` — 미노출 데스크톱 도구
- `src-tauri/src/audio.rs:1-10` — voice stub
- `src-tauri/src/swarm.rs:1-100` — 비활성 P2P
