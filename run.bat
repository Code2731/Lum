@echo off
setlocal
title LUM Launcher

:: Ollama 실행 여부 확인
curl -s --max-time 2 http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [LUM] Ollama 시작 시도 중...
    start "" ollama serve
    timeout /t 2 /nobreak >nul
)

:MENU
cls
echo ==========================================
echo       LUM Project Launcher
echo ==========================================
echo  1. Run Standard Dev (Default)
echo  2. Run with Embedded AI (CUDA/GPU)
echo  3. Clean and Run Standard
echo  4. Clean and Run with AI (CUDA)
echo  5. Exit
echo ==========================================
set /p choice="Select option (1-5): "

if "%choice%"=="1" goto DEV
if "%choice%"=="2" goto AI_DEV
if "%choice%"=="3" goto CLEAN_DEV
if "%choice%"=="4" goto CLEAN_AI_DEV
if "%choice%"=="5" exit
goto MENU

:DEV
echo [LUM] Starting Standard Dev...
npm run tauri dev
pause
goto MENU

:AI_DEV
echo [LUM] Starting Dev with Embedded AI (CUDA)...
npm run tauri:dev:cuda
pause
goto MENU

:CLEAN_DEV
echo [LUM] Cleaning and Starting Standard...
cd src-tauri && cargo clean && cd ..
npm run tauri dev
pause
goto MENU

:CLEAN_AI_DEV
echo [LUM] Cleaning and Starting AI Dev (CUDA)...
cd src-tauri && cargo clean && cd ..
npm run tauri:dev:cuda
pause
goto MENU
