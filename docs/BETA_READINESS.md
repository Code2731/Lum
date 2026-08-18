# 초기 베타 준비 상태

최종 갱신: 2026-08-18

## 코드·빌드 확인 완료

| 영역 | 확인 근거 | 상태 |
| --- | --- | --- |
| 프론트엔드 빌드 | `npm run build` 성공 | 완료 |
| 프론트엔드 단위 테스트 | 전체 `npm test -- --run` 159 파일, 2154 테스트 통과 | 완료 |
| Rust 단위 테스트 | 전체 `cargo test --lib` 419건 통과 | 완료 |
| 네이티브 UI | Metal 경로로 Tauri 창 기동, 입력창 표시, 인스펙터 가로 탭 렌더링 확인 | 완료 |
| 입력 도크 | AI 대화가 열린 상태에서도 입력 도크가 축소되지 않도록 `flex: 0 0 auto` 적용 | 완료 |
| 인스펙터 개요 | 최대 344px 폭의 인스펙터에서 2열 카드를 1열로 변경 | 완료 |
| 임베디드 AI | Metal shim을 통한 빌드·기동 후 LUM 입력창에서 `@local Reply only LOCAL_READY77` 실행. `실제 응답: mistral.rs · 로컬` 배지와 `LOCAL_READY77` 확인 | 완료 |
| xLLM 서버 | 로컬 Qwen safetensors를 MLX 4-bit로 변환하고 `127.0.0.1:8080`에서 기동. LUM 입력창에서 `@xllm Reply only XLLM_READY77` 실행. `실제 응답: xLLM` 배지와 `XLLM_READY77` 확인 | 완료 |
| Whisper 실행 환경 | 음성 프론트 6건·Rust 27건 통과. Homebrew `whisper-cli`와 `ggml-base.bin`(SHA-1 검증)을 설치했고 MacBook Pro 마이크 10초 캡처와 한국어 전사 결과를 확인함. 배경 음성이 섞인 검증이라 목표 문장 정확도는 미확인 | 부분 확인 |

## 현재 머신 실환경 판정

- `mistral.rs`는 모델명이 아니라 임베디드 추론 엔진이며, 현재 로컬 모델 설정은 Qwen safetensors입니다.
- Metal Toolchain은 shim 경로에서 정상 탐지되며, 새 실행 경로는 빌드 전에 이를 검사합니다.
- LUM의 `@local` 임베디드 응답, `@xllm` 외부 서버 응답, `@ollama` 응답은 실제 UI에서 입증됐습니다. 음성은 LUM UI에서 마이크 시작·중지, `듣는 중` 상태, 한국어 전사 결과의 입력창 삽입까지 실제로 입증됐고, 통제된 한국어 문장 정확도는 추가 확인이 필요합니다.

## 남은 수동 확인

| 항목 | 절차 | 완료 기준 |
| --- | --- | --- |
| 임베디드 로컬 라우팅 | 입력 바에 `@local Reply only LOCAL_READY77` 입력 | `LOCAL_READY77` 응답과 `mistral.rs · 로컬` 배지 확인 (완료) |
| 앱 내 xLLM 라우팅 | 입력 바에 `@xllm Reply only XLLM_READY77` 입력 | `XLLM_READY77` 응답과 `실제 응답: xLLM` 배지 확인 (완료) |
| 실제 한국어 마이크 입력 | 마이크 버튼을 눌러 한국어 문장을 직접 입력 | 한국어 전사 텍스트가 입력 바에 삽입되고 AI/셸 실행 가능 |
| Ollama 실제 응답 | `@ollama Reply only OLLAMA_READY77` 입력 | `OLLAMA_READY77` 응답과 `실제 응답: Ollama` 배지 확인 (완료) |
| 전체 Vitest 재실행 | 리소스가 한가한 상태에서 `npm test -- --run` 실행 | 159 파일 전체 요약이 성공으로 종료 |

## 알려진 품질·운영 메모

- Vite 빌드는 메인 번들이 500kB를 초과한다는 경고를 낸다. 현재 기능 오류는 아니며, 베타 이후 화면 단위 코드 분할 대상으로 관리한다.
- Whisper `base` 모델은 Metal CLI·무음 WAV 스모크와 실제 CPAL 캡처 후 전사 입력까지 정상 실행했다. 시스템 음성 스모크 결과는 `(people chattering)- Kids status.`였으므로 한국어 품질은 아직 확인해야 한다.
- `~/.lum_whisper/whisper-cli`가 없어도 PATH의 `whisper-cli`를 자동 탐색하도록 백엔드와 `run.sh`를 맞췄다. Homebrew 설치만으로도 별도 명령 템플릿 없이 기본 음성 경로를 사용할 수 있다.
- 로컬 Qwen 원본을 `~/.lum_mlx_models/Qwen2.5-Coder-14B-Instruct-4bit-v1`로 MLX 4-bit 변환해 xLLM 실환경 검증에 사용했다. 원본 `~/.lum_mistral_models`는 보존했다.
- xLLM `/v1/models`에 여러 모델이 노출될 때 설정된 코딩 모델을 우선 선택하도록 라우터를 보완했다.
- 테스트 목적으로 기동한 Metal 앱은 검증 후 종료했다. 현재 확인 시 Ollama `qwen2.5:3b` 설치와 직접 추론, LUM `@ollama` 라우팅을 완료했다.
## 최신 라운드 검증 (2026-08-19)

이번 라운드의 실제 런타임 및 빌드 게이트 결과는 다음과 같다.

- `cargo test --lib`: `419 passed, 0 failed`
- `npm test -- --run`: `159 files passed, 2154 tests passed`
- `npm run build`: 성공
- `npx playwright test`: `29 passed`
- `@local`: LUM UI에서 `실제 응답: mistral.rs · 로컬` 및 `LOCAL_READY77` 확인
- `@xllm`: LUM UI에서 `실제 응답: xLLM` 및 `XLLM_READY77` 확인
- 냉시작 ReAct: 새 Metal 프로세스 직후 `>> Reply only COLD_AGENT_READY` 실행. 15초 시점 조기 오류 없이 대기했고 약 3분 후 `COLD_AGENT_READY` 및 `Plan 완료` 확인
- 임베디드 준비 대기: 14B BF16→ISQ 자동 복원에 수 분이 걸리는 환경을 반영해 준비 timeout을 6초에서 10분으로 확장하고, 스트리밍 중단 시 대기도 취소되도록 보강
- ReAct UTF-8: 한국어 관찰 문자열의 문자 경계 회귀 테스트와 실제 `query_codebase` 관찰 경로를 통과해 바이트 슬라이싱 panic을 제거
- `cargo check --features embedded-ai`: 성공
- `cargo test --features embedded-ai --lib commands::ai`: `16 passed`
- `say -v Yuna` 기준 문장(`안녕하세요. 오늘은 LUM 음성 입력을 검증합니다.`)을 `whisper-cli -l ko`에서 직접 전사해 한국어 모델 경로를 확인. LUM UI에서도 동일 음성을 스피커→MacBook 마이크로 넣어 입력창 삽입까지 확인했으며, `LUM` 고유명사가 `늘럼/운량`으로 흔들려 정확도는 베타 수준으로 기록
- 기본 Whisper CLI 호출에 한국어(`-l ko`)를 명시하고 `LUM_WHISPER_LANGUAGE` 재정의를 추가해 영어 기본값으로 인한 한국어 전사 저하를 방지
- Ollama `list`: `qwen2.5:3b`(1.9 GB) 설치 확인. 직접 추론과 LUM `@ollama` 강제 라우팅 모두 `OLLAMA_READY77` 응답 및 `실제 응답: Ollama` 배지로 확인
- 설정 저장은 임시 파일 작성 후 `rename`하는 원자적 교체 방식으로 보강해, 읽기 중 빈 설정 파일을 관측할 수 있는 기존 race를 차단했다.
- 신규 UI는 파일 탐색기를 기본 접힘으로 시작해 터미널과 입력 도크를 우선하고, 저장된 패널 설정은 계속 복원한다. 입력 안내 문구의 대비와 `터미널 입력` 접근성 라벨도 보강했다.

`cargo fmt --check` 전체 검사는 이번 변경과 무관한 기존 파일들의 포맷 차이로 통과하지 않으며, 자동 포맷으로 해당 파일들을 확장 수정하지 않았다.

## 2026-08-19 UI/UX 스모크 확인

- 네이티브 Metal 앱에서 기본 터미널, 하단 입력 도크, 상단 툴바가 함께 렌더링되는 것을 확인했다.
- 인스펙터를 연 상태에서도 요약/전환 칩은 가로로 유지되고 입력 도크가 사라지지 않는다.
- 좁은 창에서 인스펙터 전환 레일이 세로로 줄어들지 않도록 고정 가로 흐름과 가로 스크롤을 적용했다.
- 빠른 액션 편집기는 창 높이를 제한하고 목록만 스크롤하도록 조정해 하단 새 액션 입력 영역이 화면 밖으로 밀리지 않게 했다.
- 고급 기능 팝오버의 네이티브 좌표 재현은 macOS 접근성 API가 `-10827`을 반환해 이번 라운드에서 완료하지 못했다.
