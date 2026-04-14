# LUM: Local Universal Machine

Warp 스타일 블록 기반 AI 터미널 에뮬레이터. 로컬 LLM(Ollama) 기반으로 비용 제로, 개인정보 보호, Rust 기반 고성능을 목표로 합니다.

## Tech Stack
- **Backend**: Rust (Tauri v2), portable-pty
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4
- **AI Engine**: Ollama (로컬 API)

## Features
- **블록 기반 UI**: 명령어 실행 결과를 개별 블록으로 렌더링 (Warp 스타일)
- **커스텀 타이틀바**: 드래그, 최소화/최대화/닫기, Ollama 상태 및 모델 선택
- **PTY 통합**: 시스템 셸(powershell/zsh)과 실시간 양방향 통신
- **AI 모드**: `/`로 시작하면 자연어를 셸 명령어로 변환
- **지능형 AI 컨텍스트**: 현재 디렉토리 파일 목록과 최근 실행 결과를 AI와 공유하여 스마트한 응답 제공
- **에러 분석**: 실행 실패 시 AI로 원인 분석 및 수정안 제안
- **에디터 경험 강화**: 구문 강조(Syntax Highlighting) 및 AI 모드 전용 테마 적용
- **세션 영속성**: 앱 재시작 시 이전 터미널 실행 기록 및 대화 내용 복구 (`.lum_session.json`)
- **대용량 로그 최적화**: 가상 스크롤(Virtual Scrolling)을 통한 수천 줄 로그의 빠르고 쾌적한 렌더링
- **커맨드 히스토리**: ↑↓ 키로 이전 명령어 탐색

## Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)
- [Ollama](https://ollama.com/) + 모델 (예: `ollama pull llama3`)

## Quick Start

```bash
npm install
```

### Windows / macOS
```bash
./run.sh   # macOS/Linux (Ollama 자동 실행 포함)
run.bat    # Windows
```

### 수동 실행
```bash
ollama serve              # Ollama 서버 시작 (별도 터미널)
npm run tauri dev         # 개발 모드 실행
```

## Usage
- 일반 명령어 입력 → 셸에서 실행
- `/질문` 입력 → AI가 셸 명령어로 변환 (예: `/네트워크 포트 8080 사용하는 프로세스 찾기`)
