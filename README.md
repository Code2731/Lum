# LUM: Local Universal Machine (v2.0 Spatial)

Warp 스타일 블록 기반 AI 터미널을 넘어, **무한 캔버스 공간 컴퓨팅(Infinite Canvas)**을 지원하는 차세대 로컬 AI 터미널 에뮬레이터입니다.

[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Code2731/Lum/releases/latest/download/LUM-Setup.exe)
[![Download for macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/Code2731/Lum/releases/latest/download/LUM.dmg)

## 🌌 LUM 2.0: The Spatial Workspace

LUM 2.0은 선형적인 터미널의 한계를 파괴합니다.
- **Infinite Canvas (Spatial TUI)**: 명령어를 입력하면 아래로 쌓이는 대신, 화이트보드 위의 노드처럼 자유롭게 배치하고 조작할 수 있습니다.
- **Flow-based Dependencies**: 블록 간의 논리적 흐름을 시각적인 화살표 연결선으로 표현합니다. AI가 제안하는 작업의 선후 관계를 한눈에 파악하세요.
- **Hybrid View Toggle**: 전통적인 리스트 뷰와 혁신적인 캔버스 뷰를 실시간으로 전환하며 작업 효율을 극대화합니다.

## 🚀 Key Features

- **Hardware-Aware Model Recommendations**: PC 사양(RAM·GPU)을 자동 진단하여 **Qwen2.5-Coder / Phi-3.5 EXL2** 최적 모델을 추천합니다.
- **Model Manager**: 추천 EXL2 모델을 HuggingFace에서 직접 다운로드하고, 설치된 모델을 관리(삭제)할 수 있는 내장 UI.
- **Coding Expert Agent**: 실시간 리팩토링 및 시각적 코드 리뷰 리포트 대시보드를 제공합니다.
- **Autonomous Self-Healing**: 터미널 에러 발생 시 AI가 스스로 분석하고 복구 명령어를 실행하는 루프를 지원합니다.
- **Production-Grade Security**: 파괴적 명령어 감지(Security Gate) 및 AI 생성 UI의 완전 격리(Sandbox) 렌더링.
- **Distributed Swarms (libp2p)**: 네트워크 내 다른 LUM 노드들과 협업하는 P2P 지능망 인프라.

## 🏗 Modular Architecture
프로덕션 안정성을 위해 완벽한 관심사 분리가 완료되었습니다.
- **Backend (Rust)**: `commands/`, `mcp/`, `swarm/`, `sandbox/` 등으로 모듈화 및 `thiserror` 기반 통합 에러 시스템.
- **Frontend (React)**: `useTerminalBlocks`, `useAIProcessing` 등 **Custom Hooks** 기반 상태 관리 및 독립 컴포넌트 아키텍처.

## 🛠 Tech Stack
- **Core**: Rust (Tauri v2), React 19, TypeScript
- **UI/UX**: Tailwind CSS v4, @xyflow/react (Infinite Canvas), Lucide Icons, Recharts
- **AI Engine**: xLLM / TabbyAPI (EXL2), Gemini 1.5 Pro (비전), Burn-LM (On-device WebGPU)

## 📦 Getting Started

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)
- [TabbyAPI](https://github.com/theroyallab/tabbyAPI) (xLLM 로컬 추론 서버, 기본 포트: 5000)

### Installation
```bash
npm install
npm run tauri dev
```

## 🏁 2026 Future Roadmap
- **Phase 22: 분산형 지능망 (Shared RAG Swarm)**: 🏗️ 진행 중 (노드 간 벡터 지식 공유)
- **Phase 23: 3D 시스템 시각화 (Holographic TUI)**: 📅 예정 (Three.js 기반 커널 데이터 시각화)

---
LUM 2.0 Spatial은 터미널을 단순한 도구가 아닌, 개발자의 사고를 시각화하는 공간으로 바꿉니다.
