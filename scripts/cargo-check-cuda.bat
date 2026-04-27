@echo off
REM Phase 85b — embedded-ai feature 빌드 가능성 검증용. MSVC env 활성화 후 cargo check.

set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

if not exist "%VCVARS%" (
    echo [ERROR] vcvars64.bat not found: %VCVARS%
    exit /b 1
)

call "%VCVARS%" >nul

cd /d "%~dp0\..\src-tauri"
cargo check --no-default-features --features embedded-ai
