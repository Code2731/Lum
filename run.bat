@echo off
title LUM Terminal - Dev

:: Ollama 실행 여부 확인
curl -s --max-time 2 http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [LUM] Ollama 시작 중...
    start "" "C:\Users\USER\AppData\Local\Programs\Ollama\ollama.exe" serve
    timeout /t 3 /nobreak >nul
)

echo [LUM] Tauri 개발 서버 시작...
cd /d "%~dp0"
npm run tauri dev
