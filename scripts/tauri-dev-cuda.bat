@echo off
setlocal

set "VS_PATH=C:\Program Files\Microsoft Visual Studio\2022\Community"
set "VCVARS=%VS_PATH%\VC\Auxiliary\Build\vcvars64.bat"

if not exist "%VCVARS%" (
    echo [ERROR] vcvars64.bat not found
    exit /b 1
)

call "%VCVARS%" >nul

cd /d "%~dp0\.."

echo [lum-cuda] starting Vite dev server in background
start "Vite-Lum" /B cmd /c "npm run dev"

cd src-tauri
echo [lum-cuda] cargo run --features embedded-ai (jobs=1 to reduce lock contention)
cargo run --no-default-features --features embedded-ai --jobs 1

endlocal
