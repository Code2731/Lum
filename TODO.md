# TODO

## MVP 잔여 작업 정리 (기능 · 품질 · 배포 기준)

### Done (현재 라운드 반영)

- [x] 전역 단축키 입력 포커스 회귀 계약 보강
  - `src/App.test.tsx`
  - `Cmd/Ctrl+W`, `Cmd/Ctrl+Shift+F`, `Cmd/Ctrl+Shift+O`, `Cmd/Ctrl+Shift+S`, `Cmd/Ctrl+Shift+ArrowUp/ArrowDown`
  - 커밋: `0833b78`
- [x] 전역 단축키 입력 경계 테스트 보강
  - `src/App.test.tsx`, `src/utils/event.ts`, `src/utils/event.test.ts`
  - `disabled`/`aria-disabled`/`contenteditable` 경로 회귀 장치 강화
  - 커밋: `46924c2`, `cc8216c`
- [x] 단축키 계약 2차 점검
  - `Cmd/Ctrl+Shift+L`, `Cmd/Ctrl+,` 계열의 입력 포커스 음성 경로를 `App.test.tsx`에 추가
  - `Cmd/Ctrl+Shift+L` 텍스트 입력 포커스 무시 케이스
  - `Ctrl+,` 텍스트 입력 포커스 무시 케이스
- [ ] ReAct/Editor 체인 UX 완성
  - `react_agent` 변경 내역(생성/수정/삭제) 리뷰 후 사용자 의사결정 플로우가 일관적인지 점검
  - 위험도 배지/툴팁 문구 다국어 가독성 정합성
  - [x] 변경 파일 undo 노출/활성 상태 회귀 테스트 추가 (done/error/cancelled, undoing)
  - [x] 위험도 배지 라벨(높음/보통/낮음)와 툴팁 문구 한글화 및 헤더 요약 정합성 보완

### 기능 (Feature)

- [ ] 단축키 계약 2차 점검
  - 신규/예외 단축키의 텍스트 입력 포커스 음성 경로를 `App.test`에서 1~2개씩 묶어 추가 점검
  - `Cmd/Ctrl+L`/`Cmd/Ctrl+,` 계열(테마/기타 글로벌 동작) 계약 확인
- [ ] Inspector/Workspace/History UX 연동 마감
  - Inspector 탭 전환, 워크스페이스 재개, 실패 블록 empty state 일관성
- [ ] 파일 탐색기/메인 입력 포커스 복귀 흐름 일괄 점검
  - 오버레이 종료 후 main input focus restore 경로 최종 점검

### 품질 (Quality)

- [x] 경고 분류 및 정리 (Rust 경고)
  - 1차 판정 완료: `cargo check --workspace` 기준 총 4건
  - 제로 액션/타깃 고정: `src-tauri/src/commands/embed.rs`의 `ParsedEmbedKey`, `ParsedEmbedKey::parse`, `split_model_file`을 embedded-ai 분기로 한정해 기본 빌드 dead code 경고 제거
  - 유지 전환: `src-tauri/src/bin/mcp_server.rs`의 `INVALID_PARAMS`을 `tools/call` 파라미터 유효성 경로에서 실제 사용해 상수 의미 유지
  - 후속 조치: feature 조합별 `cargo check`/`cargo check --features embedded-ai` 정합성 확인
- [ ] 테스트 문서/회귀 로그 정합성
  - `PROGRESS.md`와 회귀 테스트 케이스 매핑
  - 라운드 종료 전후 `npx vitest run`/`npx playwright test` 결과 요약 기록
- [ ] 런타임 안정성 정리
  - 커맨드 스트리밍 취소/오류 전파 경로 점검
  - 네트워크 불안정 시 fallback 동작 가드

### 배포 (Release/Distribution)

- [ ] 릴리스 체크리스트 초안 확정
  - macOS dev/build + 금속(Metal) Toolchain 체크
  - Windows CUDA dev/build 가이드 검증
  - Linux CPU 전용 경로 실행 검증
- [ ] 초기 설정/복구
  - `ui_*`/`show_*` 초기값 폴백 동작 일관성
  - 사용자 데이터(`.lum_*`) 손실 없는 복구 플로우
- [ ] 모델 미설치 상태 폴백 UX
  - embedded / ollama / xllm / cloud fallback 메시지 및 안내 문구 통일
- [ ] 배포 산출물 점검
  - `.dmg/.msi` 사전 점검 항목 체크리스트 반영
  - 앱 시작 후 첫 실행 온보딩 스모크 시나리오 포함

## 권장 다음 라운드

1. 경고 분류 기준표/해결 내역(해결·보류)을 PR/리뷰 노트로 정리
2. 기능 축에서 회귀 테스트 1~2개 추가하고 커밋
3. 배포 체크리스트 항목 중 macOS/Windows path부터 실행
