# LUM: Local Universal Machine

Warp 스타일 블록 기반 AI 터미널 에뮬레이터. 로컬 LLM(Ollama) 기반으로 비용 제로, 개인정보 보호, Rust 기반 고성능을 목표로 합니다.

## Tech Stack
- **Backend**: Rust (Tauri v2), portable-pty, ignore
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + react-resizable-panels + react-virtuoso
- **AI Engine**: Ollama (로컬 API)

## Features
- **블록 기반 UI**: 명령어 실행 결과를 개별 블록으로 렌더링 (Warp 스타일)
- **멀티 탭 및 스플릿 팬**: 하나의 창에서 여러 탭을 관리하고, 각 탭 내에서 화면을 가로/세로로 분할 가능
- **AI 워크플로우 (Agentic UI)**: AI가 제안한 다단계 작업(명령어 실행, 파일 생성 등)을 클릭 한 번으로 승인 및 실행
- **리치 마크다운 렌더링**: AI 답변 내의 코드 블록 실행 버튼 및 마크다운 문법 지원
- **로컬 모델 매니저**: Ollama 모델 다운로드(Pull) 및 삭제 기능을 GUI에서 직접 관리 (실시간 진행률 표시)
- **지능형 AI 컨텍스트**: 프로젝트 전체 구조(RAG-lite)와 파일 내용을 인식하여 스마트한 응답 제공
- **커스텀 타이틀바**: 드래그, 최소화/최대화/닫기, 검색 및 설정 기능 통합
- **세션 영속성**: 앱 재시작 시 이전 터미널 실행 기록 및 대화 내용 자동 복구
- **에디터 경험 강화**: Tab 자동 완성, PrismJS 기반 구문 강조, AI 모드 전용 UI
- **대용량 로그 최적화**: 가상 스크롤을 통한 수천 줄 로그의 쾌적한 렌더링

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

## Usage
- 일반 명령어 입력 → 활성화된 팬에서 실행
- `/질문` 입력 → AI가 명령어 또는 워크플로우 제안
- **Tab**: 파일/폴더 자동 완성
- **Split**: 상단 버튼으로 화면 분할
- **Settings**: 폰트 크기, 투명도, 강조 색상 및 AI 모델 관리
