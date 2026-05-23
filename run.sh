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

# 실행 모드 안내
cat <<'EOF'
----------------------------------------
실행 모드 선택:
1) Standard Dev (기본)
2) Standard Dev (native/NoDevServer, 바인딩 이슈 우회)
3) Standard Dev + 임베디드 AI (macOS Metal / Linux CUDA)
4) Exit
----------------------------------------
EOF

read -r -p "선택: " choice < /dev/tty

case "${choice}" in
  1)
    echo "Tauri 개발 서버 실행 중... (기본)"
    npm run tauri dev
    ;;
  2)
    read -r -p "Native host (기본: ${LUM_DEV_HOST:-127.0.0.1}): " native_host < /dev/tty
    read -r -p "Native port (기본: ${LUM_DEV_PORT:-1420}): " native_port < /dev/tty

    native_host="${native_host:-${LUM_DEV_HOST:-127.0.0.1}}"
    native_port="${native_port:-${LUM_DEV_PORT:-1420}}"

    echo "Tauri 개발 서버 실행 중... (native/no-dev-server)"
    npm run tauri:dev:native -- --host "${native_host}" --port "${native_port}"
    ;;
  3)
    echo "Embedded AI 기반 개발 서버 실행 중..."
    case "$(uname -s)" in
      Darwin)
        npm run tauri:dev:metal
        ;;
      *)
        npm run tauri -- dev --features embedded-ai
        ;;
    esac
    ;;
  4|*)
    echo "종료"
    exit 0
    ;;
esac
