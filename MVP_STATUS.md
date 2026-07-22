# MVP Status (Code-based)

이 문서는 **코드 존재/연결 여부 기준 MVP readiness**를 빠르게 확인하기 위한 체크포인트입니다.

## 실행 방법

```bash
npm run mvp:readiness
npm run mvp:readiness:json
node scripts/mvp-readiness.mjs --strict-voice
```

## 판정 규칙

- 필수 코어 항목은 모두 `PASS`여야 MVP 코어 충족으로 판정합니다.
- Voice 입력은 CPAL 로컬 캡처 + `whisper.cpp` 전사까지 구현됐지만, VAD 자동 종료와 모델 자동 배포가 남아 있어 `PARTIAL`을 허용합니다.
- `--strict-voice`를 사용하면 Voice가 `PASS`가 아닐 때 전체 판정을 실패로 처리합니다.

## 포함 항목(자동 점검)

- Real PTY 코어 (`spawn_pty`, `write_to_pty`)
- 임베디드 AI 라우팅 (`stream_ai_command`, `ai_route_event`)
- ReAct 코드편집 + Undo
- Persistent Memory Vault
- Healing 데이터 수집 루프
- LoRA Forge 시작 경로
- MCP 추천 번들 설치 경로
- 자연어 코딩 의도 라우터
- Code Intelligence 도구 surface (`query_codebase`, `query_graph`)
- Voice 입력 경로 상태(PASS/PARTIAL/FAIL)

## 참고

- 체크 스크립트: [scripts/mvp-readiness.mjs](/Users/namhyunjun/MyProject/Lum/scripts/mvp-readiness.mjs)
