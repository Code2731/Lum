# PROGRESS

## 2026-06-28

### 이번 라운드까지 완료

- 전역 단축키 포커스 계약 범위 확장
  - `src/App.test.tsx`
  - 기존 `글로벌 단축키는 입력 필드 포커스 시 동작하지 않는다(Ctrl/Cmd)` 케이스를 확대해 주요 전역 조합(Ctrl/Meta + 단독/Shift/Alt 변형, 퀵 액션 인덱스)을 일괄 검증하도록 보강
  - `KeyboardEvent.dispatchEvent`의 기본 동작이 유지되는지까지 확인해 포커스 계약 회귀를 더 공격적으로 고정
  - textarea/contenteditable 포커스 경로까지 별도 케이스로 확장해 텍스트 입력 대상의 범위를 명시적으로 고정
  - contenteditable의 빈 문자열/`plaintext-only`, role 기반 `searchbox`까지 포함해 `isTextInputTarget` 의도 범위를 테스트로 고정
- `isTextInputTarget` 회귀 방어 보강
  - `src/utils/event.test.ts`
  - `contenteditable` 확장 케이스(`''`, `plaintext-only`)와 텍스트 입력 비대상 타입(`checkbox`, `button`, `submit`, `reset`, `file`)를 음성(미차단) 테스트로 고정
- 전역 단축키 동작 반대 계약 고정
  - `src/App.test.tsx`
  - 텍스트 입력이 아닌 포커스(버튼)에서는 전역 단축키가 정상 동작함을 검증

### 현재 상태 요약

## 2026-06-26

### 이번 라운드까지 완료

- 오버레이 종료 후 메인 입력 포커스 복귀 단위 테스트 확장
  - `src/components/AppOverlays.test.tsx`
  - 웰컴 힌트 닫힘 후 메인 입력 포커스 복귀 검증
  - 온보딩 완료 후 메인 입력 포커스 복귀 검증
  - 히스토리 검색/SSH 모달/명령어 팔레트/워크스페이스 종료 시 포커스 복귀 검증
  - 웰컴 경로의 `save_ui_preferences({ hintsShown: true })` 호출까지 함께 확인
- 헤더 오버레이 종료 포커스 복귀 경로 테스트 보강
  - `src/components/AppHeader.test.tsx`
  - 고급 메뉴를 트리거 버튼으로 닫을 때 포커스가 트리거로 복귀하는지 검증
  - 알림 센터 닫기 버튼/트리거 버튼으로 닫을 때 포커스가 트리거로 복귀하는지 검증
- 히스토리 검색 단축키 포커스 계약 테스트 고정
  - `src/App.test.tsx`
  - 입력 포커스 중 `Ctrl+R`은 전역 히스토리 검색 단축키로 처리되지 않음을 검증
  - 기존 양성 케이스(`Ctrl+R` 오픈, 리스트/캔버스 뷰 예외, `Cmd+R` 무시)와 함께 히스토리 검색 단축키 계약을 더 또렷하게 고정
- AI 바 단축키 포커스 계약 테스트 고정
  - `src/App.test.tsx`
  - 입력 포커스 중 `Cmd/Ctrl+Shift+K`는 전역 AI 바 단축키로 처리되지 않음을 검증
  - 기존 양성 케이스(`Cmd+Shift+K` 오픈, 도움말 표기)와 함께 단축키 계약을 더 또렷하게 고정
- 첫 실행 포커스 복귀 UX 보강
  - `src/components/AppOverlays.tsx`
  - 웰컴 힌트 닫힘 후 메인 입력 포커스 자동 복귀
  - 온보딩 완료 후 `터미널 시작하기` 종료 시 메인 입력 포커스 자동 복귀
- 포커스 복귀 타깃 Playwright 검증 통과
  - `npx playwright test e2e/smoke.spec.ts --grep '첫 실행 웰컴 힌트는 닫은 뒤 바로 입력 흐름으로 진입할 수 있다|온보딩 완료 단계의 터미널 시작하기는 온보딩을 닫고 메인 화면으로 진입한다'`
  - 결과: `2 passed`
- Playwright 스모크 전체 재통과
  - `npx playwright test e2e/smoke.spec.ts`
  - 결과: `29 passed`
- Inspector 중심 E2E 회귀 범위 확장
  - `Recent Blocks LOAD → AI 프롬프트 적재`
  - `Failed Block AI ANALYZE → Last AI Analyze 카드 갱신`
  - `Last AI Analyze LOAD → AI 입력바 반영`
  - `Last AI Analyze RUN → PTY 전송`
  - `추천 커맨드 RUN → 알림 센터 실행 피드백`
  - `Inspector 표시 여부 새로고침 영속성`
  - `Inspector 밀도(COZY/COMPACT) 새로고침 영속성`
  - `파일 탐색기 폴더 이동 → 여기로 cd → OSC7 기반 cwd 반영`
  - `첫 실행 웰컴 힌트 → 닫기 후 즉시 입력 진입`
  - `첫 실행 온보딩 → 하드웨어 분석 단계 진입`
  - `온보딩 완료 → 터미널 시작하기 종료 경로`
  - `온보딩 종료 직후 → 헤더 툴바 새 탭 진입`
  - `온보딩 종료 직후 → 액션 팔레트 진입`
  - `온보딩 종료 직후 → AI 입력바 진입`
  - `온보딩 종료 직후 → 파일 탐색기 진입`

### 이번 안정화 라운드에서 반영한 핵심 수정

- E2E mock을 실제 Inspector 흐름 계약에 맞게 보강
  - `e2e/setup/tauri-mock.ts`
    - Tauri event listener 추적/emit 헬퍼 유지
    - 설정 mock 영속성 유지
    - AI 분석용 mock 응답을 추천 커맨드 파싱 가능한 형태로 확장
    - `verify_command_safety` mock 응답 추가
    - `invoke` 호출 기록 추적 헬퍼 추가
- Playwright 스모크 범위 확장
  - `e2e/smoke.spec.ts`
    - Inspector 열림/닫힘 영속성
    - Inspector 밀도 영속성
    - Failed Block / Last AI Analyze 추천 커맨드 상호작용
    - 파일 탐색기 `cwd` 반영 흐름 추가
    - 첫 실행 웰컴 힌트 / 온보딩 진입 검증 추가
    - 추천 커맨드 실행 후 알림 센터 피드백 검증 추가
    - 온보딩 완료 후 메인 화면 복귀 검증 추가
    - 온보딩 종료 직후 툴바 진입 검증 추가
    - 온보딩 종료 직후 액션 팔레트 진입 검증 추가
    - 온보딩 종료 직후 AI 입력바 진입 검증 추가
    - 온보딩 종료 직후 파일 탐색기 진입 검증 추가
    - 전체 스모크 29케이스 기준 누적 회귀 확인 완료
- 첫 실행 오버레이 종료 후 포커스 복귀 보강
  - `src/components/AppOverlays.tsx`
    - 웰컴 힌트와 온보딩 종료 시점에 공통 포커스 복귀 헬퍼 추가
    - 메인 입력이 바로 활성 상태로 돌아오도록 `requestAnimationFrame` 기반 복귀 처리
- 전역 단축키 포커스 음성 계약 보강
  - `src/App.test.tsx`
    - 텍스트 입력이 포커스를 가진 상태에서는 AI 바 단축키가 무시되어야 한다는 테스트 추가
    - 이미 있던 AI 바 오픈/도움말 테스트와 함께 입력 포커스 경계 조건을 고정
- 히스토리 검색 단축키 포커스 음성 계약 보강
  - `src/App.test.tsx`
    - 텍스트 입력이 포커스를 가진 상태에서는 `Ctrl+R` 히스토리 검색 단축키가 무시되어야 한다는 테스트 추가
    - 기존 `Ctrl+R` 양성/뷰 모드 예외/`Cmd+R` 무시 테스트와 함께 입력 포커스 경계 조건을 고정
- 첫 실행 오버레이 포커스 복귀 단위 테스트 추가
  - `src/components/AppOverlays.test.tsx`
    - 웰컴/온보딩/히스토리 검색/SSH/명령어 팔레트/워크스페이스 종료 경로에서 메인 입력 포커스 복귀를 단위 테스트로 고정
    - 포커스 복귀 구현(`requestAnimationFrame`)이 바뀌어도 즉시 회귀를 잡을 수 있는 얇은 안전망 추가

### 현재 상태 요약

- 프론트 단위/통합 테스트: 안정화 완료
- Rust 백엔드 테스트: 안정화 완료
- Playwright 스모크: `29 passed`
- 첫 실행 포커스 복귀 타깃 회귀: `2 passed`
- AI 바 단축키 포커스 계약: 단위 테스트로 고정 완료
- 히스토리 검색 단축키 포커스 계약: 단위 테스트로 고정 완료
- 웰컴 힌트 / 온보딩 / 히스토리 검색 / SSH / 명령어 팔레트 / 워크스페이스 포커스 복귀: 단위 테스트로 고정 완료
- 헤더 오버레이(고급 메뉴/알림 센터) 닫기 후 포커스 복귀: 단위 테스트로 고정 완료
- 현재 라운드 기준으로 MVP 검증용 핵심 UI 회귀 방어선이 한 단계 더 강화됨

### 다음 추천 라운드

1. 나머지 전역 단축키의 입력 포커스 계약 점검
3. 이번 누적 변경분 커밋 및 푸시

## 2026-06-25

### 이번 라운드까지 완료

- 프론트엔드 `Vitest` 전체 통과
  - `npx vitest run`
  - 결과: `55 files passed`, `1505 tests passed`
- Rust 테스트 전체 통과
  - `cargo test`
  - 결과:
    - `src/lib.rs`: `403 passed`
    - `src/bin/mcp_server.rs`: `16 passed`
- Playwright 스모크 통과
  - `npx playwright test e2e/smoke.spec.ts`
  - 결과: `10 passed`

### 이번 안정화 라운드에서 반영한 핵심 수정

- 프론트 테스트 기대값을 현재 UI/라우팅 정책에 맞게 정리
  - `src/App.test.tsx`
  - `src/components/InspectorPanel.test.tsx`
  - `src/components/AppHeader.test.tsx`
  - `src/components/PrivacyLedgerBadge.test.tsx`
  - `src/components/TerminalPane.test.tsx`
  - `src/hooks/useInspectorPanelData.test.ts`
  - `src/hooks/useInspectorPanelController.test.ts`
  - `src/hooks/useInspectorPanelDataPropsPipeline.test.tsx`
  - `src/utils/inspectorAnalyze.test.ts`
- Rust 설정/백업 회귀 정리
  - `src-tauri/src/commands/config.rs`
    - `AppConfig`, `QuickAction`에 `PartialEq` 파생 추가
  - `src-tauri/src/commands/react_agent.rs`
    - `track_pre_write`가 `cwd` 밖 경로를 존재 여부와 무관하게 먼저 거부하도록 정리
- E2E 스모크를 현재 UI 계약에 맞게 정리
  - `e2e/smoke.spec.ts`
    - `Cmd` 전용 기대값을 `Cmd/Ctrl` 라벨 기준으로 수정
    - SSH/새 탭/액션 팔레트/좁은 뷰포트 흐름을 실제 트리거 경로 기준으로 수정
  - `src/components/AppHeader.tsx`
    - 팝오버 배치 계산 시 `visualViewport`와 `innerWidth/innerHeight`를 보수적으로 교차
  - `src/components/NotificationCenter.tsx`
    - 내부 폭을 `w-full`로 바꿔 좁은 뷰포트에서 우측 오버플로 방지
- MCP 서버 테스트 경고 1건 정리
  - `src-tauri/src/bin/mcp_server.rs`
    - 테스트 함수명을 snake_case로 정리

### 현재 상태 요약

- 프론트 단위/통합 테스트: 안정화 완료
- Rust 백엔드 테스트: 안정화 완료
- Playwright 스모크: 통과
- 현재 라운드 기준으로 MVP 검증용 기본 테스트 축은 모두 녹색

### 다음 추천 라운드

1. 이번 누적 변경분 커밋 및 푸시
2. 남아 있는 경고를 “실제 불필요 코드”와 “타깃별 조건부 경고”로 분류
3. `TODO.md`를 추가해 MVP 남은 작업을 기능/품질/배포 기준으로 정리
