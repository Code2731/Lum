#!/bin/bash
set -e

echo "LUM: Local Universal Machine 시작 중..."

# node_modules 확인
if [ ! -d "node_modules" ]; then
    echo "의존성 설치 중 (npm install)..."
    npm install
fi

# xLLM 서버 상태 확인 (선택 — 없어도 앱 내에서 시작 가능)
XLLM_URL="${XLLM_URL:-http://127.0.0.1:5000}"
if curl -sf --max-time 2 "${XLLM_URL}/v1/models" >/dev/null 2>&1; then
    echo "xLLM 서버 온라인 (${XLLM_URL})"
else
    echo "xLLM 서버 오프라인 — 앱 내 xLLM 패널에서 시작하세요."
fi

# Tauri 개발 서버 실행
echo "Tauri 개발 서버 실행 중..."
npm run tauri dev
