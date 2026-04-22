@echo off
title LUM Terminal - Dev

:: Ollama 실행 여부 확인 (이미 실행 중이면 스킵)
curl -s --max-time 2 http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [LUM] Ollama 시작 중...

    :: 설치 경로 순서대로 탐색
    set "OLLAMA_EXE="
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
    ) else if exist "%ProgramFiles%\Ollama\ollama.exe" (
        set "OLLAMA_EXE=%ProgramFiles%\Ollama\ollama.exe"
    ) else (
        :: PATH에 ollama 명령이 있는지 확인
        where ollama >nul 2>&1
        if %errorlevel% equ 0 set "OLLAMA_EXE=ollama"
    )

    if defined OLLAMA_EXE (
        start "" "%OLLAMA_EXE%" serve
        timeout /t 3 /nobreak >nul
    ) else (
        echo [LUM] Ollama 실행 파일을 찾을 수 없습니다. https://ollama.com 에서 설치하세요.
    )
)

echo [LUM] Tauri 개발 서버 시작...
cd /d "%~dp0"
npm run tauri dev
