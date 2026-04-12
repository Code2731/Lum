#!/bin/bash
echo "🚀 LUM: Local Universal Machine 시작 중..."
echo "📦 의존성 설치 확인..."
npm install
echo "🖥️ Tauri 개발 서버 실행 (창이 뜰 때까지 잠시만 기다려주세요)..."
npm run tauri dev
