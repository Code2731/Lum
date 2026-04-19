# LUM: Local Universal Machine

Warp 스타일 블록 기반 AI 터미널 에뮬레이터. 로컬 LLM(Ollama & xLLM/EXL2) 기반으로 비용 제로, 개인정보 보호, Rust 기반 고성능을 목표로 합니다.

## 🚀 Key Features

- **Warp-style Block UI**: 명령어 실행 결과를 개별 블록으로 렌더링하여 가독성과 관리 효율성을 극대화합니다.
- **Hardware-Aware Model Recommendations**: 사용자의 RAM/VRAM 사양을 자동으로 감지하여 **Qwen2.5-Coder (Ollama vs. xLLM/EXL2)** 중 최적의 모델과 추론 엔진을 추천합니다.
- **Coding Expert Agent**: 
  - **Refactoring**: 코드 구조를 분석하고 즉시 적용 가능한 패치를 제안합니다.
  - **Code Review Reports**: 가독성, 보안성, 성능 점수가 포함된 시각적 대시보드 리포트를 생성합니다.
- **Autonomous Self-Healing**: 에러 발생 시 AI가 스스로 원인을 분석하고, 복구 계획(Healing Plan)을 세워 자동으로 수정 명령어를 실행합니다.
- **Security Gate & Sandboxing**:
  - **Security Gate**: 파괴적인 명령어(rm -rf 등)를 사전에 감지하고 차단하거나 사용자 승인을 요구합니다.
  - **UI Sandbox**: AI가 생성한 동적 UI를 격리된 `iframe` 환경에서 안전하게 렌더링합니다.
- **Distributed Swarms (libp2p)**: P2P 네트워크를 통해 주변 노드를 탐색하고, 복잡한 작업을 다른 기기로 위임하여 협업합니다.
- **WebGPU On-device AI (Burn-LM)**: 외부 API 없이 로컬 GPU에서 직접 텐서 연산을 수행하여 완벽한 오프라인 지능을 구현합니다.

## 🛠 Tech Stack
- **Backend**: Rust (Tauri v2), libp2p, burn-wgpu, enigo, screenshots
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Recharts
- **AI Engine**: Ollama (GGUF), xLLM (EXL2), Gemini 1.5 Pro, Burn-LM

## 📦 Getting Started

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)
- [Ollama](https://ollama.com/) (Optional for xLLM mode)

### Installation
```bash
npm install
npm run tauri dev
```

## 📋 Usage Guide
- **Setup Wizard**: 앱 최초 실행 시 하드웨어 사양을 진단하고 최적의 AI 모델 설치를 도와줍니다.
- **`/refactor`**: 활성화된 코드 파일에 대한 리팩토링 제안 및 자동 패치를 수행합니다.
- **`/review`**: 코드 품질 점수와 이슈 리스트가 포함된 인터랙티브 리포트를 생성합니다.
- **`Cmd+K`**: 유니버설 커맨드 팔레트를 열어 파일, 히스토리, 기능을 검색합니다.
- **Autonomous Fix**: 터미널 에러 발생 시 나타나는 AI 자가 치유 버튼을 활용하세요.

## 🏁 2026 Future Roadmap
- **Phase 20: 신경망 데스크탑 통합 (Neural Desktop)**: ✅ 완료 (OS 자율 제어 시스템)
- **Phase 21: 시각적 자율 에이전트 (Neural Vision)**: 🏗️ 진행 중 (멀티모달 시각 인지 루프 고도화)
- **Phase 22: 분산형 지능망 (Shared RAG Swarm)**: 📅 예정 (노드 간 벡터 지식 공유 시스템)

---
LUM은 당신의 로컬 하드웨어를 가장 강력한 AI 워크스테이션으로 탈바꿈시킵니다.
