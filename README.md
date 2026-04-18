# LUM: Local Universal Machine

Warp 스타일 블록 기반 AI 터미널 에뮬레이터. 로컬 LLM(Ollama) 기반으로 비용 제로, 개인정보 보호, Rust 기반 고성능을 목표로 합니다.

## Tech Stack
- **Backend**: Rust (Tauri v2), portable-pty, ignore, futures-util
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vitest + Fuse.js
- **AI Engine**: Ollama (로컬 API - Llama3, Mistral, Nomic-Embed-Text 등)
## Features
- **블록 기반 UI**: 명령어 실행 결과를 개별 블록으로 렌더링 (Warp 스타일)
- **멀티 탭 및 스플릿 팬**: 하나의 창에서 여러 탭을 관리하고, 각 탭 내에서 화면을 가로/세로로 분할 가능
- **심층 코드베이스 RAG**: 프로젝트 전체 소스코드를 함수 단위로 벡터화하여 AI에게 저장소 전체에 대한 완벽한 지식 제공 (설정에서 인덱싱 가능)
- **멀티모달 시각 인식 (Visual-Aware)**: 내장 웹뷰 팬 통합으로 프런트엔드 실행 화면을 띄우고, AI가 시각적 문맥(Visual Context)을 인지하여 응답 (`Cmd+B`)
- **유니버설 커맨드 팔레트**: `Cmd+K`로 파일, 명령어 히스토리, 앱 기능을 통합 검색 (Fuse.js 퍼지 검색 적용)
- **예측형 고스트 텍스트**: 명령어 입력 시 히스토리를 분석하여 다음 입력을 회색 텍스트로 제안, `→` 키로 즉시 완성
- **AI 워크플로우 (Agentic UI)**: AI가 제안한 다단계 작업(명령어 실행, 파일 생성 등)을 클릭 한 번으로 승인 및 실행
- **의미론적 히스토리 검색**: 단순 키워드를 넘어, 벡터 유사도(Embeddings)를 바탕으로 과거 작업 기록 검색 (`? ` 접두사 사용)
- **자율 에러 복구 (Auto-Fix)**: 에러 발생 시 AI가 스스로 분석하고 해결 명령어를 자동 실행
- **지능형 데이터 시각화**: JSON 배열 출력 결과를 가독성 높은 표(Table) 형태로 자동 변환
- **로컬 모델 매니저**: Ollama 모델 다운로드(Pull) 및 삭제 기능을 GUI에서 직접 관리 (실시간 진행률 표시)
- **품질 보증 (TDD)**: Vitest(프론트엔드) 및 Cargo Test(백엔드)를 통한 핵심 로직 자동 검증
- **세션 및 레이아웃 영속성**: 앱 재시작 시 이전 터미널 히스토리와 분할된 팬 상태까지 완벽 복구

## Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)
- [Ollama](https://ollama.com/)

## Quick Start

```bash
npm install
```

### Windows / macOS / Linux
```bash
./run.sh   # macOS/Linux (Ollama 자동 실행 포함)
run.bat    # Windows
```

## Testing
```bash
npm test              # 프론트엔드 단위/통합 테스트
cd src-tauri && cargo test  # 백엔드 단위 테스트
```

## Usage
- 일반 명령어 입력 → 활성화된 팬에서 실행
- `/질문` 입력 → AI가 명령어 또는 워크플로우 제안
- **Settings -> Index Codebase**: 프로젝트 전체 코드 인덱싱 시작
- `Cmd+K`: 커맨드 팔레트 열기 (파일/명령어 검색)
- `→ (Right Arrow)`: 고스트 텍스트 자동 완성 수락
- `Cmd+D` / `Cmd+Shift+D`: 화면 수직/수평 분할
- `Cmd+B`: 시각적 웹 브라우저(Visual Browser) 팬 켜기/끄기

## 🚀 2026 Future Roadmap
- **Phase 10: 자율 에이전트 군집 (Agent Swarms)**: ✅ 완료 (Planner, Coder, Reviewer, Tester)
- **Gemini 통합**: ✅ 완료 (Gemini 1.5 Flash/Pro 지원 및 커스텀 시스템 프롬프트 지원)
- **Phase 11: WebGPU 온디바이스 AI**: ✅ 완료 (Burn-LM 기반 GPU 가속, 토크나이저 및 엔드투엔드 추론 파이프라인 구축)
- **Phase 12: 자율 실행 샌드박스 (Secure Sandbox)**: ✅ 완료 (위험 명령어 정적 분석 및 사용자 승인 시스템 구축)
- **Phase 13: 외부 도구 연동 (MCP Integration)**: ✅ 완료 (Model Context Protocol 기반 외부 서비스/도구 연동)
- **Phase 14: 시각적 셸 (Multi-Modal Visual Shell)**: ✅ 완료 (Recharts 기반 데이터 시각화 및 동적 차트 생성)
- **Phase 15: 장기 기억 엔진 (Semantic Memory)**: ✅ 완료 (과거 대화 및 작업 내역 벡터 검색 지원)
- **Phase 16: 음성 인터페이스 (Voice-to-Terminal)**: ✅ 완료 (Whisper 기반 음성 명령 인식 인프라 구축)
- **Phase 17: 자율 자가 치유 (Autonomous Self-Healing)**: ✅ 완료 (에러 감지 시 AI가 스스로 분석 및 수정 재검증 수행)
- **Phase 18: 분산형 군집 에이전트 (Distributed Swarms)**: ✅ 완료 (libp2p 기반 P2P 네트워크 및 원격 에이전트 협업 인프라)
- **Phase 19: 생성형 UI 셸 (AI Native UI Designer)**: ✅ 완료 (실시간 React/Tailwind 코드 생성 및 런타임 렌더링)
- **Phase 20: 신경망 데스크탑 통합 (Neural Desktop)**: ✅ 완료 (OS 화면 인지 및 마우스/키보드 자율 제어 시스템 구축)
- **Phase 21: 시각적 자율 에이전트 (Neural Vision & OS Autonomy)**: 🏗️ 진행 중 (멀티모달 시각 인지 루프 및 자율 조작 피드백 시스템 구축)

