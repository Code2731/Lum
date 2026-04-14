#!/bin/bash
echo "🚀 LUM: Local Universal Machine 시작 중..."

# Ollama 실행 여부 확인
if ! curl -s --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "🤖 Ollama 서버가 실행 중이 아닙니다. 백그라운드에서 시작합니다..."
    
    # Ollama 명령어가 설치되어 있는지 확인
    if command -v ollama >/dev/null 2>&1; then
        ollama serve > /tmp/ollama.log 2>&1 &
        echo "⏳ Ollama 서버가 준비될 때까지 잠시 기다립니다 (5초)..."
        sleep 5
    else
        echo "⚠️  경고: 'ollama' 명령어를 찾을 수 없습니다. Ollama를 직접 실행해 주세요."
    fi
else
    echo "✅ Ollama 서버가 이미 실행 중입니다."
fi

# Tauri 개발 서버 실행
echo "🖥️ Tauri 개발 서버 실행 (창이 뜰 때까지 잠시만 기다려주세요)..."
npm run tauri dev
