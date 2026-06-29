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
- [x] ReAct/Editor 체인 UX 완성
  - `react_agent` 변경 내역(생성/수정/삭제) 리뷰 후 사용자 의사결정 플로우가 일관적인지 점검
  - 위험도 배지/툴팁 문구 다국어 가독성 정합성
  - [x] 변경 파일 undo 노출/활성 상태 회귀 테스트 추가 (done/error/cancelled, undoing)
  - [x] 위험도 배지 라벨(높음/보통/낮음)와 툴팁 문구 한글화 및 헤더 요약 정합성 보완
  - [x] 변경 파일 종류(신규/수정/삭제) 표시 회귀 테스트 추가

### 기능 (Feature)

- [x] 단축키 계약 2차 점검
  - `입력 포커스 중에는 Cmd/Ctrl+Shift+R`, `Cmd/Ctrl+Shift+M`이 AI Diff Reviewer/시스템 모니터 패널 오픈으로 이어지지 않음을 `App.test.tsx`로 고정
  - `Cmd/Ctrl+L`/`Cmd/Ctrl+,` 계열(테마/기타 글로벌 동작) 계약 확인
- [x] Inspector/Workspace/History UX 연동 마감
  - [x] Inspector 탭 전환, 워크스페이스 재개, 실패 블록 empty state 일관성
- [x] 파일 탐색기/메인 입력 포커스 복귀 흐름 일괄 점검
  - File Explorer/Workspace/Markdown 종료 후 main input focus restore 경로 최종 점검

### 품질 (Quality)

- [x] 경고 분류 및 정리 (Rust 경고)
  - 1차 판정 완료: `cargo check --workspace` 기준 총 4건
  - 제로 액션/타깃 고정: `src-tauri/src/commands/embed.rs`의 `ParsedEmbedKey`, `ParsedEmbedKey::parse`, `split_model_file`을 embedded-ai 분기로 한정해 기본 빌드 dead code 경고 제거
  - 유지 전환: `src-tauri/src/bin/mcp_server.rs`의 `INVALID_PARAMS`을 `tools/call` 파라미터 유효성 경로에서 실제 사용해 상수 의미 유지
  - 후속 조치: feature 조합별 `cargo check`/`cargo check --features embedded-ai` 정합성 확인
- [x] 경고 분류 기준표/해결 내역 정리 (PR/리뷰 노트)
  - 해결군(폐기/제거): `embed.rs` 내 `ParsedEmbedKey` dead code 경고군
    - `#[cfg(feature = "embedded-ai")]` 분기 이동으로 기본 빌드 경고 제거
  - 보류군(설계 의도 유지): `mcp_server.rs::INVALID_PARAMS` 상수 사용
    - 경고 제거 대신 실동작 경로에 반영해 규격적 처리(`tools/call` 파라미터 타입 불일치) 유지
  - 보류군(조건부 노출): `embedded-ai` 미활성/활성 빌드 조건 분기
    - `cargo check` 명령행 조합별 경고 추적(기본/embedded-ai)로 감지/합의 선회
- [x] 테스트 문서/회귀 로그 정합성
  - `PROGRESS.md`와 회귀 테스트 케이스 매핑
  - 라운드 종료 전후 `npx vitest run`/`npx playwright test` 결과 요약 기록
- [ ] 런타임 안정성 정리
  - [x] 커맨드 스트리밍 취소/오류 전파 메시지 정합성 정비
    - `App.tsx` AI 바 응답 실패 시 오류 객체/메시지 정규화, 취소 오류 인지 보강
  - 네트워크 불안정 시 fallback 동작 가드
  - 커맨드 취소 후 UI 이벤트와 상태 정합성 회귀 장치 정리

- [ ] MCP/AI 라우팅 장애 복구
  - 네트워크 타임아웃, 라우팅 실패, 백엔드 미연결 상태의 사용자 안내/재시도 동선 고정
  - fallback 전환 시 안내 텍스트의 일관성 유지

### 배포 (Release/Distribution)

- [x] 릴리스 체크리스트 초안 확정 (macOS + Windows Path 우선)
  - macOS Path
    - `xcodebuild -downloadComponent MetalToolchain` 또는 `xcode-select --install` 사전 확인
    - `npm run tauri:dev:metal` / `npm run tauri build -- --features embedded-ai` 실행 항목 정의
    - `*.dmg` 산출물 위치, `aarch64.dmg`/`x64.dmg` 구분, 실행 직후 초기 온보딩/포커스 경로 점검 항목 정합
  - Windows Path
    - CUDA Toolkit 12.x + MSVC toolchain 설치/호환성 체크리스트 정의
    - `scripts/tauri-dev-cuda.bat` / `npm run tauri:dev:cuda`로 dev 빌드 시나리오 정리
    - `npm run tauri build -- --features embedded-ai` 또는 CPU fallback 경로 산출물 확인 항목 정리
    - `.msi` 산출물 설치/실행 점검 항목(권한, 설치 경로, 실행/종료, 온보딩 진입) 추가
  - Linux CPU Path(보류)
    - `npm run tauri build` lightweight 경로(비 embedded-ai) 기반 회귀 테스트 시나리오로 다음 라운드 연계
- [ ] 초기 설정/복구
  - `ui_*`/`show_*` 초기값 폴백 동작 일관성
  - 사용자 데이터(`.lum_*`) 손실 없는 복구 플로우
- [ ] 모델 미설치 상태 폴백 UX
  - embedded / ollama / xllm / cloud fallback 메시지 및 안내 문구 통일
- [x] 배포 산출물 점검
  - [x] `.dmg/.msi` 사전 점검 항목 체크리스트 반영
    - macOS: `*.dmg` 생성물(aarch64/x64) 존재, `xattr -dr com.apple.quarantine` 적용 권장, 최초 실행 및 온보딩 진입
    - Windows: `.msi` 생성물 존재, 설치/권한/해제, 실행 후 AI/포커스·온보딩 진입, 종료/재시작 경로
  - [x] 앱 시작 후 첫 실행 온보딩 스모크 시나리오 포함
    - 웰컴 힌트 노출 → 닫기
    - 온보딩 완료 → 메인 화면 입력 진입
    - 메인 입력 포커스 복귀(포커스 레이어) 확인

## 권장 다음 라운드

- [ ] 1. 런타임 안정성 정리
  - 스트리밍 취소/오류 전파, 네트워크 불안정 fallback, 상태 복구 UX를 기능으로 정리
- [ ] 2. 초기 설정/복구 경로 정합성
  - `ui_*`, `show_*` 기본값 불일치, `.lum_*` 복구/마이그레이션 경로를 1회 점검
- [ ] 3. 모델 미설치 fallback UX 통일
  - embedded/ollama/xllm/cloud 메시지 톤 및 액션 가이드를 사용자별로 통일
- [ ] 4. 배포 Linux CPU 경로 회귀
  - `npm run tauri build` 기반 smoke 경로를 다음 라운드 초반 실행

## 2026-06-29 추천 라운드 반영

- [x] 테스트 문서/회귀 로그 정합성
  - `PROGRESS.md`에 라운드별 테스트 경로/결과를 매핑(파일 탐색기/워크스페이스/마크다운 포커스 복귀 회귀 포함)
  - 회귀 테스트 근거:
    - 포커스 복귀: `src/App.test.tsx`, `src/components/AppOverlays.test.tsx`
    - 입력 라우팅/단축키 경계: `src/utils/event.test.ts`, `src/App.test.tsx`, `src/components/AppHeader.test.tsx`
    - 통합 플로우 회귀: `e2e/smoke.spec.ts`

## 2026-06-30 추천 라운드 반영

- [x] 경고 분류 기준표/해결 내역 정리
  - PR/리뷰 노트 제출용 텍스트로 분류 축을 고정(해결/보류/조건부)
  - 해결군: `ParsedEmbedKey` 데드코드 경고군 3건
  - 보류군: `mcp_server` 유효성 경로 상수 유지 및 `embedded-ai` 빌드 조건부 경고군
