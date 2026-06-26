# TODO

## MVP 우선순위

### 1. 릴리스 직전 필수

- 실제 사용자 기준 E2E 확장
  - 현재 `e2e/smoke.spec.ts` `28 passed`
  - 기본 실행/AI 응답/Inspector 추천 커맨드/영속성까지는 커버됨
  - 아직 남은 핵심 사용자 흐름:
  - 우선순위:
    - 첫 실행 직후 `파일 탐색기` 사용성이 방해 없이 이어지는지 확인
    - 웰컴 힌트/온보딩 종료 후 포커스 복귀가 일관적인지 확인
- 설정 영속성 최종 확인
  - 툴바 단순 모드
  - Inspector 표시 여부
  - Inspector 밀도(`cozy` / `compact`)
  - 파일 탐색기 표시 여부
  - AI 채팅 폰트 크기
  - `ui_seen_advanced_features`
- 첫 실행 경험 점검
  - 온보딩/웰컴 힌트가 테스트/실사용 모두에서 흐름을 방해하지 않는지 확인
  - 첫 진입 후 “무엇을 해야 하는지” 안내가 충분한지 점검

### 2. 기능 완성도 보강

- TerminalPane 입력 오버레이 UX 다듬기
  - `ACTION PALETTE`
  - `INPUT HISTORY`
  - `SHORTCUT CHEATSHEET`
  - 좁은 뷰포트와 포커스 복귀 동작 추가 점검
- AppHeader 오버레이 배치 추가 검증
  - 고급 기능 메뉴
  - 알림 센터
  - Privacy Ledger 상세
  - 매우 좁은 가로폭에서 버튼/패널 겹침 여부 점검
- Inspector UX 마감
  - 실패 블록/추천 커맨드/최근 블록이 비어 있을 때 empty state 문구 통일
  - 빠른 액션 버튼 우선순위 재검토
  - 추천 커맨드 실행 후 사용자 피드백 배치(알림/포커스 복귀) 점검

### 3. 백엔드 안정성 보강

- `embedded-ai` 관련 경로 재점검
  - feature on/off 상태 모두에서 invoke 계약이 동일한지 확인
  - 저장된 embed key 복원 경로 수동 검증
- ReAct 파일 변경 안전모델 추가 점검
  - 백업 생성
  - undo 복원
  - 위험도 분류 UI
  - `cwd` 밖 경로 차단
- MCP 서버 실사용 검증
  - `lum-mcp-server`를 외부 클라이언트에서 붙였을 때 최소 read/list 흐름 확인

### 4. 품질/운영

- Rust 경고 분류
  - 실제 제거해야 할 코드
  - 타깃별 빌드에서만 보이는 경고
  - 당장 유지해야 하는 경고
- 테스트 문서 체계 유지
  - `PROGRESS.md` 업데이트 루틴 유지
  - 테스트 안정화/회귀 수정 후 기록 남기기
- 릴리스 체크리스트 초안 만들기
  - macOS dev/build
  - Windows CUDA dev/build
  - 기본 설정 파일 생성/복구
  - 모델 미설치 상태 fallback UX

## 추천 다음 라운드

1. 첫 실행 직후 `파일 탐색기` 사용성 점검
2. 웰컴 힌트/온보딩 종료 후 포커스 복귀 점검
3. 이번 누적 변경분 커밋/푸시
