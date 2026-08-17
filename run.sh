#!/bin/bash
set -e

echo "LUM: Local Universal Machine 시작 중..."

# node_modules 확인
if [ ! -d "node_modules" ]; then
    echo "의존성 설치 중 (npm install)..."
    npm install
fi

# xLLM 서버 상태 확인 (선택 — 없어도 앱 내에서 시작 가능)
# 앱의 기본 xLLM 주소와 통일. 환경변수 지정 시에는 해당 주소를 그대로 사용한다.
XLLM_URL="${XLLM_URL:-http://127.0.0.1:8080}"
if curl -sf --max-time 2 "${XLLM_URL}/v1/models" >/dev/null 2>&1; then
    echo "xLLM 서버 온라인 (${XLLM_URL})"
else
    echo "xLLM 서버 오프라인 — 앱 내 xLLM 패널에서 시작하세요."
fi

# 로컬 음성 입력 준비 상태 확인. 모델은 첫 녹음 시 자동 다운로드할 수 있지만,
# whisper.cpp 실행 파일이 없으면 자동 다운로드도 시작할 수 없다.
VOICE_DIR="${LUM_WHISPER_DIR:-${HOME}/.lum_whisper}"
VOICE_CLI="${LUM_WHISPER_CPP_CMD:-${VOICE_DIR}/whisper-cli}"
VOICE_MODEL="${LUM_WHISPER_MODEL:-${VOICE_DIR}/models/ggml-base.bin}"
if [ -x "${VOICE_CLI}" ] && [ -f "${VOICE_MODEL}" ]; then
    echo "음성 입력 준비됨 (whisper.cpp + base 모델)"
elif [ -x "${VOICE_CLI}" ]; then
    echo "음성 입력 부분 준비 — base 모델은 첫 녹음 시 자동 다운로드 대상 (${VOICE_MODEL})"
else
    echo "음성 입력 준비 안 됨 — whisper-cli를 ${VOICE_DIR}에 설치하세요."
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
        export CLANG_MODULE_CACHE_PATH="$PWD/src-tauri/target/clang-module-cache"
        export LUM_METAL_MODULE_CACHE="$CLANG_MODULE_CACHE_PATH"
        mkdir -p "$CLANG_MODULE_CACHE_PATH"
        export PATH="$PWD/scripts/xcrun-shims:$PATH"
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
