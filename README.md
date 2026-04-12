# 🏗️ LUM: Local Universal Machine

AI-Native Terminal Emulator powered by Local LLM.

LUM은 Warp 스타일의 블록 기반 UI를 가진 로컬 AI 터미널입니다. 비용 제로(Local LLM), 개인정보 보호, Rust 기반의 고성능을 목표로 합니다.

## 🚀 Key Values
- **비용 제로**: 로컬 LLM(Ollama)을 사용하여 API 비용이 들지 않습니다.
- **개인정보 보호**: 모든 데이터 처리가 로컬에서 이루어져 보안이 뛰어납니다.
- **고성능**: Rust(Tauri v2) 기반의 가볍고 빠른 터미널 엔진을 제공합니다.

## 🛠 Tech Stack
- **Backend**: Rust (Tauri v2)
- **Frontend**: React + TypeScript + Tailwind CSS v4
- **Terminal Core**: `portable-pty` (Rust)
- **AI Engine**: Ollama (Local API)
- **Icons**: Lucide React

## ✨ Features (Phase 1: MVP)
- [x] **Block-Based UI**: 모든 명령어 실행 결과를 개별 카드(Block) 형태로 렌더링.
- [x] **Smart Input**: 일반 입력 모드와 AI 모드(`/` 접두사) 지원.
- [x] **PTY Integration**: 실제 시스템 셸(zsh/powershell)과 실시간 양방향 통신.
- [x] **Neon Dark Mode**: Cyan Neon Glow 효과를 가진 현대적인 터미널 UI.
- [ ] **AI Command Suggestion**: 자연어를 셸 명령어로 변환 (진행 중).
- [ ] **Error Analysis**: 실행 실패 시 에러 원인 분석 및 수정안 제안 (진행 중).

## 📦 Getting Started

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)
- [Ollama](https://ollama.com/) (llama3 또는 deepseek-coder 모델 필요)

### Installation
1. Repository 클론
2. 의존성 설치:
   ```bash
   npm install
   ```
3. 개발 모드 실행:
   ```bash
   npm run tauri dev
   ```

## 💡 Tip
AI 모드를 사용하려면 입력창에 `/`를 먼저 입력하세요. 예: `/네트워크 포트 8080 사용하는 프로세스 찾아줘`
