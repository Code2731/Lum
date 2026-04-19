# LUM: Local Universal Machine

Warp 스타일 블록 기반 AI 터미널 에뮬레이터. 로컬 LLM(Ollama) 기반으로 비용 제로, 개인정보 보호, Rust 기반 고성능을 목표로 합니다.

## Tech Stack
- **Backend**: Rust (Tauri v2), portable-pty, ignore, futures-util, libp2p, burn-wgpu
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vitest + Fuse.js
- **AI Engine**: Ollama (로컬 API - Llama3, Mistral, Nomic-Embed-Text 등), Gemini 1.5 Pro/Flash, Burn-LM (On-device WebGPU)

## Features
- **블록 기반 UI**: 명령어 실행 결과를 개별 블록으로 렌더링 (Warp 스타일)
- **자율 에러 복구 (Autonomous Self-Healing)**: 에러 발생 시 AI가 스스로 원인을 분석하고, 복구 계획(Healing Plan)을 세워 자동으로 수정 명령어를 실행합니다.
- **WebGPU 온디바이스 AI**: Burn-WGPU를 통해 로컬 GPU에서 직접 AI 추론을 수행하여 클라우드 의존성 없이 보안이 강화된 응답을 제공합니다.
- **분산형 군집 에이전트 (Distributed Swarms)**: libp2p P2P 네트워크를 통해 주변 노드를 탐색하고, 복잡한 작업을 다른 기기로 위임하여 협업하는 인프라를 지원합니다.
- **지능형 MCP 도구 연동**: Model Context Protocol(MCP) 서버 프로세스를 영속적으로 관리하여 지연 시간 없이 외부 도구와 실시간으로 연동합니다.
- **심층 코드베이스 RAG**: 프로젝트 전체 소스코드를 벡터화하여 AI에게 저장소 전체에 대한 완벽한 지식을 제공합니다.
- **멀티모달 시각 인식 (Visual-Aware)**: 내장 웹뷰 팬과 연동하여 프런트엔드 실행 화면을 AI가 시각적으로 인지하고 조작합니다.
- **생성형 UI 셸 (AI Native UI Designer)**: AI가 실시간으로 React/Tailwind 코드를 생성하고 런타임에 즉시 렌더링하여 인터랙티브 UI를 제공합니다.

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
- `Cmd+B`: 시각적 웹 브라우저(Visual Browser) 팬 켜기/끄기
- **Autonomous Self-Heal**: 에러 발생 시 나타나는 버튼을 통해 AI 자율 복구 수행

## 🚀 2026 Future Roadmap
- **Phase 10: 자율 에이전트 군집 (Agent Swarms)**: ✅ 완료
- **Gemini 통합**: ✅ 완료
- **Phase 11: WebGPU 온디바이스 AI**: ✅ 완료 (Burn-LM 기반 GPU 가속 및 파이프라인 구축)
- **Phase 12: 자율 실행 샌드박스 (Secure Sandbox)**: ✅ 완료
- **Phase 13: 외부 도구 연동 (MCP Integration)**: ✅ 완료 (프로세스 영속성 최적화)
- **Phase 14: 시각적 셸 (Multi-Modal Visual Shell)**: ✅ 완료
- **Phase 15: 장기 기억 엔진 (Semantic Memory)**: ✅ 완료
- **Phase 16: 음성 인터페이스 (Voice-to-Terminal)**: ✅ 완료
- **Phase 17: 자율 자가 치유 (Autonomous Self-Healing)**: ✅ 완료 (에러 감지 및 복구 루프 구축)
- **Phase 18: 분산형 군집 에이전트 (Distributed Swarms)**: ✅ 완료 (libp2p P2P 인프라 구축)
- **Phase 19: 생성형 UI 셸 (AI Native UI Designer)**: ✅ 완료
- **Phase 20: 신경망 데스크탑 통합 (Neural Desktop)**: ✅ 완료
- **Phase 21: 시각적 자율 에이전트 (Neural Vision & OS Autonomy)**: 🏗️ 진행 중
