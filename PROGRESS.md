# PROGRESS

## 2026-07-07

### 이번 라운드 완료

- 추천 라운드 1~3 실행: 경고 분류/문서 동기화/회귀 테스트 범위 축소
  - 남은 경고 분류를 “실제 불필요 코드”와 “타깃별 조건부 경고”로 재분류
    - 실제 불필요 코드: 기본 빌드에서만 남는 `embed.rs` dead code 성격 경고군
    - 조건부 경고: `embedded-ai` feature 조합/기반 모듈 경로에서 조합별로 검출되는 경고군
  - `TODO.md` 기능/품질/배포 기준 섹션의 추천 항목을 이번 라운드 반영 상태로 정합화
  - 회귀 실행 전략을 “1~2개 테스트 묶음”으로 제한해 운영 가이드에 반영
  - `git log` 기준 최신 라운드 상태(권장 항목 미해결 목록)와 정렬
- 추가 반영: `clear` 동작에서 스트리밍 미존재 경로의 안전성 강화
  - `src/hooks/useAIChat.test.ts`에 비스트리밍 상태에서 `clear` 호출 시 `cancel_ai_stream`이 중복 호출되지 않는 회귀 테스트 추가
- 다음 추천 라운드 목표
  - 남은 경고를 실재 불필요 코드/타깃별 조건부로 분류를 마무리
  - `TODO.md`를 기능/품질/배포 기준으로 갱신
  - 회귀 테스트는 1~2개 묶음으로만 실행

- 2026-07-08 추가 반영
  - AI 대화 취소 UX 회귀 보강
    - `src/hooks/useAIChat.test.ts`에 진행 중 `cancel()` 호출 시 메시지 히스토리 유지 회귀 테스트 추가
  - AI 대화 cancel 경계 회귀 보강
    - `src/hooks/useAIChat.test.ts`에 비스트리밍 상태에서 `cancel()` 호출 시 `cancel_ai_stream` 미호출을 보장하는 테스트 추가
  - AI 대화 취소 에러 정책 회귀 보강
    - `src/hooks/useAIChat.test.ts`에 `cancel` 경합으로 `stream_ai_command` 취소 시 에러 배너 미노출을 보장하는 테스트 추가
  - AI 대화 cancel 이벤트 경합 회귀 보강
    - `src/hooks/useAIChat.test.ts`에 취소 직후 이벤트 리스너 해제 및 누락 토큰 반영 방지를 보장하는 테스트 추가
  - AI 대화 복구 경로 회귀 보강
    - `src/hooks/useAIChat.test.ts`에 cancel 후 즉시 재시작이 가능한지 검증하는 테스트 추가

### 2026-07-09 추천 라운드 반영

- `useAIChat` 취소/복구/리스너 정리 회귀 보강
  - clear/cancel 동작의 경합 방지 케이스와 취소 후 즉시 재시작 경로를 추가 회귀로 안정화

### 다음 추천 라운드

- 런타임 상태 복구 경로와 스트리밍 취소 UX를 1차 정리
- Linux CPU 경로 빌드 회귀를 1개 smoke 테스트로 고정

### 이번 라운드 후속 반영

- AI 대화 스트리밍 런타임 복구 반영
  - `src/hooks/useAIChat.ts`에서 clear 동작 중 진행 중인 스트림을 `cancel_ai_stream`로 강제 종료하도록 보완
  - 취소 경로와 clear 경로를 분리해, 대화창 정리 시 상태 플래그(`streaming`)와 에러 상태를 즉시 안정화
- Linux CPU 상태 회귀 기준 정합성 점검
  - `ci.yml` `Build Desktop App (Linux CPU smoke)`가 1개 주요 회귀 경로로 이미 배치되어 있어 문서 기준을 “고정 테스트 1개”로 확정

## 2026-07-05

### 이번 라운드 완료

- WarpInputBar backend 배지 tooltip 한글 표현 정합성 보강
  - `src/components/WarpInputBar.tsx` backend 배지 tooltip의 `direct` 영문 표현을 `직접`으로 통일
  - `src/components/WarpInputBar.test.tsx` tooltip 문구의 한글 표현 회귀 보강
- WarpInputBar backend-only 안내 문구 동사 정합성 보강
  - `src/components/WarpInputBar.tsx` backend-only 안내의 `Cmd/Ctrl+./,` 동작 설명을 `전환`에서 `순환`으로 통일
  - `src/components/WarpInputBar.test.tsx` backend-only 안내에 direct 순환 문구 노출 회귀 보강
- WarpInputBar backend 배지 tooltip 계약 정합성 보강
  - `src/components/WarpInputBar.tsx` backend 배지 tooltip을 `Cmd/Ctrl+1~4/0` direct 지정·해제와 `Cmd/Ctrl+./,` direct 순환 기준으로 갱신
  - `src/components/WarpInputBar.test.tsx` tooltip 문구 회귀 테스트 1건 추가
- WarpInputBar 기본 backend 힌트 계약 정합성 보강
  - `src/components/WarpInputBar.tsx` 빈 입력 도움말을 `Cmd/Ctrl+1~4/0` 선택·해제 + `Cmd/Ctrl+./,` 순환 안내까지 포함하도록 갱신
  - `src/components/WarpInputBar.test.tsx` 기본 도움말에 direct backend 순환 문구 노출 회귀 테스트 보강
- TerminalPane shortcut cheatsheet backend 계약 정합성 보강
  - `src/components/TerminalPane.tsx` 치트시트에 `Cmd/Ctrl+1~4/0` direct backend 지정·해제와 `Cmd/Ctrl+./,` direct backend 순환 항목 추가
  - `src/components/TerminalPane.test.tsx` 치트시트 오픈 시 해당 항목 노출 회귀 테스트 추가
- TerminalPane 입력 툴밸트 문구의 백엔드 용어 정합성 보강
  - `src/components/TerminalPane.tsx` 입력 TIP 배너와 치트시트에서 `backend` 표현을 `백엔드`로 통일
  - `src/components/TerminalPane.test.tsx` 문구 검증 기대값을 동일 기준으로 갱신
- WarpInputBar 기본 힌트 라벨 정합성 보강
  - `src/components/WarpInputBar.tsx` 기본 입력 힌트의 `backend` 라벨을 `백엔드`로 통일
  - `src/components/WarpInputBar.test.tsx` 관련 회귀 기대값을 동일 용어로 갱신
- WarpInputBar 백엔드 툴팁 라벨 정합성 보강
  - `src/components/WarpInputBar.tsx` 백엔드 강제 상태 안내 툴팁 문구의 `backend` 표기를 `백엔드`로 통일
- TerminalPane action palette placeholder 정합성 보강
  - `src/components/TerminalPane.tsx` action 검색 예시의 `backend` 표기를 `백엔드`로 통일
  - `src/components/TerminalPane.test.tsx` placeholder 노출 회귀 테스트 추가
- TerminalPane action palette backend 액션 라벨 정합성 보강
  - `src/components/TerminalPane.tsx` `Backend Auto Toggle / Back / Last` 라벨을 `백엔드 AUTO 토글 / 백엔드 이전 / 백엔드 마지막`으로 변경
  - `src/components/TerminalPane.test.tsx` 백엔드 액션 라벨 노출 회귀 테스트 추가
- TerminalPane backend 강제 칩 라벨 정합성 보강
  - `src/components/TerminalPane.tsx` 입력 칩의 `BACKEND FORCED` 라벨을 `백엔드 강제`로 정규화
  - `src/components/TerminalPane.test.tsx` 기존 `BACKEND FORCED` 노출/부재 기대값을 `백엔드 강제`로 갱신
- WarpInputBar 백엔드 뱃지 및 TerminalPane 백엔드 치트시트 용어 정합성 보강
  - `src/components/WarpInputBar.tsx` 백엔드 뱃지 라벨을 `BACKEND` → `백엔드`로 정규화
  - `src/components/WarpInputBar.test.tsx` 뱃지 라벨 노출 회귀 기대값을 `백엔드` 기준으로 갱신
  - `src/components/TerminalPane.tsx` 백엔드 치트시트 라인(`BACK/LAST`, `AUTO 토글`)을 `백엔드 이전/마지막`, `자동 토글`로 정규화
  - `src/components/TerminalPane.test.tsx` 치트시트/툴팁 문자열 회귀 기대값을 동일 기준으로 갱신
- 회귀 검증
  - `npm test -- --run src/components/WarpInputBar.test.tsx` 결과: 1 file / 64 tests passed
  - `npm test -- --run src/components/WarpInputBar.test.tsx` 결과: 1 file / 63 tests passed
  - `npm test -- --run src/components/TerminalPane.test.tsx` 결과: 1 file / 160 tests passed
  - `npm test -- --run src/components/TerminalPane.test.tsx -t "Action Palette의 백엔드 액션 라벨이 한국어로 표시된다"` 결과: 1 test passed
  - `npm test -- --run src/components/WarpInputBar.test.tsx` 결과: 1 file / 64 tests passed
- 라우팅/액션 칩 한글 정합성 추가 보강
  - `src/components/TerminalPane.tsx`
    - 라우팅 칩 라벨 기본값을 `SHELL/AGENT/AI CMD #/EXPLAIN ?/HEAVY !!`에서 `셸/에이전트/AI 명령 #/설명 ?/헤비 !!`로 정규화
    - 자동 라우팅 태그(`AUTO`)를 `자동`으로 정규화
    - 액션 팔레트 라벨(입력 기록/입력 지우기/실행 중단/복구/Recall 관련/토글류) 일괄 한글화
  - `src/components/TerminalPane.test.tsx`
    - 라우팅 칩/액션 라벨 회귀 기대값을 `셸/AI 자동/에이전트/AI 명령 #/설명 ?` 기준으로 갱신
- 회귀 검증
  - `npm test -- --run src/components/TerminalPane.test.tsx` 결과: 1 file / 160 tests passed

## 2026-07-04

### 이번 라운드 완료

- TerminalPane backend 툴벨트 팁 계약 정합성 보강
  - `src/components/TerminalPane.tsx` 좁은/기본 툴벨트 TIP 문구를 `Cmd/Ctrl+1~4/0` 지정·해제와 `Cmd/Ctrl+./,` 순환 안내까지 포함하도록 갱신
  - `src/components/TerminalPane.test.tsx` TIP 배너 실노출 경로 양성 테스트 1건 추가
- Warp 입력창 backend quick-switch 안내 UX 보강
  - `src/components/WarpInputBar.tsx` 빈 입력 도움말에 `Cmd/Ctrl+1-4` 선택, `Cmd/Ctrl+0` 해제 단축키 노출 추가
  - backend prefix-only 상태 안내에 `Cmd/Ctrl+0` 해제 + `Cmd/Ctrl+./,` 순환 가이드 추가
  - `src/components/WarpInputBar.test.tsx` 관련 안내 문구 회귀 테스트 2건 추가
- MCP/AI 라우팅 장애 대응 정합성 마감
  - `scripts/run-e2e-noserver.js`의 launch profile 복구 분기 정렬(권한 계열 에러를 복구 가능로 이동) 반영
  - `scripts/run-e2e-noserver.test.ts` 테스트 기대값 업데이트 및 재시도 동작 보강
  - `src/components/ToolCallCard.tsx` MCP 툴 실패 메시지 가이드 라우팅 + 재실행 버튼 회귀 반영
  - `src/utils/errorMessage.ts` 라우팅/네트워크 문구 강화 + 타임아웃 키워드 보완
  - `src/components/ToolCallCard.test.tsx`, `src/utils/errorMessage.test.ts` 추가/갱신으로 회귀 고정
- 회귀 검증
  - `npm test -- --run src/components/TerminalPane.test.tsx` 결과: 1 file / 158 tests passed
  - `npm test -- --run src/components/WarpInputBar.test.tsx` 결과: 1 file / 63 tests passed
  - `npm test -- --run` 결과: 61 files / 1610 tests passed
  - `npm run lint` 통과
  - `cd src-tauri && cargo test` 통과
  - `npm run test:e2e`는 현재 로컬 샌드박스에서 `127.0.0.1:1420` 바인딩 제한(`EPERM`)으로 실행되지 않아, CI에서는 noserver+사전 기동/준비 확인 플로우로 회피
  - `cd src-tauri && cargo test --features embedded-ai`는 macOS Metal Toolchain 부재(`cannot execute tool 'metal'`)로 환경 제약 실패
- `npm test -- --run` 경로로 `scripts/run-e2e-noserver.test.ts`를 포함한 전체 테스트를 통합 검증
- Linux CI에서 Playwright 스모크 경로를 정식화
  - `cd .github/workflows/ci.yml`에 Ubuntu job에서 Playwright 설치 후 `npm run dev -- --host 127.0.0.1 --port 1420` 기동 + `npm run test:e2e:noserver`로 noserver 경로 실행(기동 완료 대기/종료 보장 포함) 단계 추가

### 현재 상태 요약

- MCP 툴 실행 실패 경로가 “라우팅 실패/네트워크 불안정/취소/재시도”로 구분되어 사용자 가이던스가 일정해짐
- Playwright noserver 런치 스크립트는 권한/샌드박스 제약 환경에서 더 넓은 폴백 탐색을 수행하도록 동작 업데이트

## 2026-06-29

### 이번 라운드까지 완료

- Rust 경고 해소 작업 1차 실행
  - `src-tauri/src/commands/embed.rs`
    - `ParsedEmbedKey`, `ParsedEmbedKey::parse`, `split_model_file`을 `embedded-ai` feature 분기로 한정해 기본 빌드 경고를 제거
  - `src-tauri/src/bin/mcp_server.rs`
    - `tools/call`에서 파라미터 타입 불일치 시 `INVALID_PARAMS`(JSON-RPC `-32602`)를 실제 에러 경로로 사용
- `TODO.md` 경고 분류 항목과 일치하도록 변경 반영 상태 유지
- 단축키 2차 점검 회귀 테스트 추가
  - `src/App.test.tsx`
    - 입력 필드 포커스 상태에서 `Cmd/Ctrl+Shift+L`이 스크립트 패널 토글로 처리되지 않음을 고정
    - 입력 필드 포커스 상태에서 `Ctrl+,`가 테마 패널 토글로 처리되지 않음을 고정
    - 입력 필드 포커스 상태에서 `Cmd/Ctrl+Shift+R`가 AI Diff Reviewer 오픈으로 이어지지 않음을 고정
    - 입력 필드 포커스 상태에서 `Cmd/Ctrl+Shift+M`이 시스템 모니터 오픈으로 이어지지 않음을 고정
- 테스트 문서/회귀 로그 정합성 정리
  - `TODO.md`에 본 라운드 회귀 테스트 경로(`focus restore`, `단축키 경계`, `E2E 스모크`)를 매핑
  - 이번 라운드 핵심 회귀 항목
    - 파일 탐색기/워크스페이스/마크다운 종료 후 메인 입력 포커스 복귀: `src/App.tsx`, `src/App.test.tsx`, `src/components/AppOverlays.tsx`, `src/components/AppOverlays.test.tsx`
    - 입력 포커스 경계 대비 AI/히스토리 단축키 계약: `src/utils/event.ts`, `src/utils/event.test.ts`, `src/App.test.tsx`
    - 오버레이 종료/온보딩 포커스 복귀: `src/components/AppOverlays.tsx`, `src/components/AppOverlays.test.tsx`
    - 헤더 오버레이 종료 포커스 복귀: `src/components/AppHeader.test.tsx`
  - 회귀 실행/요약 이력 정합성
    - `npx vitest run`: `55 files passed`, `1505 tests passed` (이전 라운드 누적 기준)
    - `npx playwright test e2e/smoke.spec.ts`: `29 passed` (이전 라운드 누적 기준)
- 경고 분류 기준표 정리(해결/보류)
  - 해결군: `src-tauri/src/commands/embed.rs` dead code 경고(embedded-ai 분기 정리로 제거)
  - 보류군: `src-tauri/src/bin/mcp_server.rs::INVALID_PARAMS` 경고를 유효성 경로 반영(`tools/call`)로 치환해 의도 유지
  - 보류군: `embedded-ai` 비활성/활성 조합의 조건부 경고 항목은 빌드 조합별 점검 로그로 추적

## 2026-06-30 추천 라운드 반영 (배포 체크리스트 선행)

- 릴리스 체크리스트 초안 확정(우선순위: macOS + Windows)
  - macOS 경로
    - MetalToolchain 전제 조건 및 `npm run tauri:dev:metal`/`npm run tauri build -- --features embedded-ai` 실행 체크 항목 정리
    - `.dmg` 산출물 분기(aarch64.dmg / x64.dmg) 및 `xattr` 보안 해제 검증 항목 정리
    - 앱 최초 실행 시 온보딩 진입 및 포커스 초기 상태 점검 항목 정리
  - Windows 경로
    - CUDA 12.x + MSVC/Visual Studio 도구 전제 조건을 릴리스 전 체크리스트로 고정
    - `scripts/tauri-dev-cuda.bat`, `npm run tauri:dev:cuda`, `npm run tauri build -- --features embedded-ai` 실행 항목 정리
    - `.msi` 산출물 설치·실행·온보딩 진입 점검 항목 정리
  - Linux 경로
    - `npm run tauri build` 기반 CPU-only 경로를 CI에 추가해 smoke 빌드 회귀 포인트를 확보
    - `release.yml` Ubuntu 매트릭스에 `--bundles deb,appimage` 추가

## 2026-07-01 추천 라운드 반영 (배포 산출물 체크리스트)

- 배포 산출물 점검 체크리스트 문서 확정
  - `.dmg/.msi` 사전 점검을 항목화
    - macOS: `aarch64.dmg`/`x64.dmg` 생성물 존재, DMG 보안 해제 점검, 앱 최초 실행 및 온보딩 진입
    - Windows: `.msi` 생성물 존재, 설치/실행/재시작, 포커스/온보딩 초기 진입
  - 첫 실행 온보딩 스모크 시나리오 점검 항목 추가
    - 웰컴 힌트 노출 및 닫기
    - 온보딩 완료 후 메인 입력 진입
    - 메인 입력 포커스 복귀 경로

## 2026-07-02 추천 라운드 반영 (로드맵 정렬)

- 문서 정합성 마감
  - `TODO.md`의 테스트 문서/회귀 정합성 항목을 완료 처리
  - 배포 산출물 점검 항목의 완료/체크 상태를 `TODO.md`와 정렬
- 다음 라운드 우선순위 수립
  - 런타임 안정성: 스트리밍 취소/오류 전파 경로, 상태 복구 UX
  - 초기 설정/복구: `ui_*`, `show_*` 초기값·복구 경로
  - 모델 미설치 fallback UX: embedded/ollama/xllm/cloud 안내 일관성
  - MCP/AI 라우팅 장애 대응: 타임아웃/미연결/재시도 가이드 고정
  - Linux 배포 CPU 경로 smoke 테스트 재개

### 현재 상태 요약

- 기능: 핵심 UI 회귀 항목은 유지, 경고 처리 우선순위가 실제 코드 반영 단계로 이동
- 기능: `Cmd/Ctrl+Shift+L`, `Ctrl+,` 텍스트 입력 포커스 음성 경로 계약이 추가됨
- 품질: Rust 경고에서 3건은 feature 경계 정리로 즉시 정리, 1건은 유효성 경로 반영으로 설계 의도 유지
- 품질: 테스트 문서-회귀 매핑을 정리해 `TODO`/`PROGRESS` 정합성을 마무리
- 품질: 경고 분류(해결·보류·조건부)를 PR/리뷰 노트용으로 정리해 다음 라운드 기준 문서 정합성 확보
- 품질/배포: 릴리스 체크리스트를 macOS + Windows path 기준으로 초안 정리해 다음 라운드 실행 항목으로 고정

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
- `contenteditable` 음성 경로를 한 단계 더 명확화
  - `src/utils/event.test.ts`
  - `contenteditable='false'`가 텍스트 입력으로 오탐되지 않음을 검증
- `contenteditable='false'` 자식 노드에 대한 오탐 차단도 단위 테스트로 추가
  - `src/utils/event.test.ts`
  - `contenteditable='false'` 컨테이너 내부 자식이 텍스트 입력으로 판정되지 않음을 검증
- 전역 단축키의 음성 경로를 App 레벨에서도 검증
  - `src/App.test.tsx`
  - `contenteditable='false'` 내부 요소 포커스에서 `Ctrl+B`가 정상 동작해 파일 탐색기가 토글되는지 확인
- 전역 단축키 동작 반대 계약 고정
  - `src/App.test.tsx`
  - 텍스트 입력이 아닌 포커스(버튼)에서는 전역 단축키가 정상 동작함을 검증
- 전역 단축키의 부분 음성 경로를 보강
  - `src/App.test.tsx`
  - readonly textarea 포커스에서 `Ctrl+Shift+K`가 동작해 AI 바가 토글되는지 검증
- App 레벨 `isTextInputTarget` 음성 경로 확장
  - `src/App.test.tsx`
  - readonly input 포커스에서 `Ctrl+Shift+K`가 동작해 AI 바가 토글되는지 검증
- 텍스트 입력 판정 기준 보강
  - `src/utils/event.ts`, `src/utils/event.test.ts`
  - `disabled` 입력/textarea를 텍스트 입력 타깃에서 제외
- App 레벨 disabled 케이스 회귀 확장
  - `src/App.test.tsx`
  - `disabled` textarea/input에서 `Ctrl+Shift+K`가 동작해 AI 바가 토글되는지 검증
- aria-disabled 텍스트 입력 타깃 배제 규칙 보강
  - `src/utils/event.ts`, `src/utils/event.test.ts`, `src/App.test.tsx`
  - `aria-disabled=true` role=textbox를 텍스트 입력 텍스트 타깃에서 제외하고, App 레벨 동작 검증 추가
- aria-disabled plaintext-only contenteditable 회귀 확장
  - `src/utils/event.test.ts`, `src/App.test.tsx`
  - `aria-disabled=true` + `contenteditable='plaintext-only'` 조합도 텍스트 입력 타깃에서 제외
- role=textbox + aria-disabled + contenteditable='plaintext-only' 경로 보강
  - `src/utils/event.test.ts`, `src/App.test.tsx`
  - 이중 속성 조합 노드도 텍스트 입력 타깃에서 제외
- role=searchbox + aria-disabled 경로 보강
  - `src/utils/event.test.ts`, `src/App.test.tsx`
  - role=searchbox에서 aria-disabled 처리 경계 고정
- role=combobox + aria-disabled 경로 보강
  - `src/utils/event.test.ts`, `src/App.test.tsx`
  - role=combobox 자손까지 포함해 aria-disabled 처리 경계 고정
- aria-disabled 실제 입력 엘리먼트 경계 보강
  - `src/utils/event.ts`, `src/utils/event.test.ts`, `src/App.test.tsx`
  - `<input>/<textarea>`에 `aria-disabled="true"`가 붙으면 텍스트 입력 타깃에서 제외
- 전역 단축키 입력 포커스 회귀 경로 보강
  - `src/App.test.tsx`
  - `Cmd/Ctrl+W`, `Cmd/Ctrl+Shift+F`, `Cmd/Ctrl+Shift+O`, `Cmd/Ctrl+Shift+S`, `Cmd/Ctrl+Shift+ArrowUp/ArrowDown`를 입력 필드 포커스에서 전역 핫키가 가로채지 않도록 테스트 확장

### 현재 상태 요약

- 프론트 단위/통합 테스트: 전역 단축키 입력 포커스 회귀 케이스까지 확장 반영
- 전역 단축키 계약: 핵심 조합(Ctrl/Cmd+W/F/O/S/블록 네비) 누락 경로 마감
- 커밋/푸시: `0833b78` 반영 완료

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

1. 남아 있는 경고를 “실제 불필요 코드”와 “타깃별 조건부 경고”로 분류
2. `TODO.md`를 추가/갱신해 MVP 남은 작업을 기능/품질/배포 기준으로 정리
3. 다음 추천 라운드에서는 회귀 테스트 1~2개만 묶어 실행

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
