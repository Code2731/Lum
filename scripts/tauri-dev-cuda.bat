@echo off
REM Phase 85b — mistralrs-core CUDA 빌드를 위한 MSVC 환경 자동 활성화 wrapper.
REM cargo가 nvcc 호출 시 호스트 컴파일러로 cl.exe를 찾는데, 일반 PATH에는
REM 없으므로 vcvars64.bat을 먼저 호출해서 PATH/INCLUDE/LIB 환경변수 주입.

set "VS_PATH=C:\Program Files\Microsoft Visual Studio\2022\Community"
set "VCVARS=%VS_PATH%\VC\Auxiliary\Build\vcvars64.bat"

if not exist "%VCVARS%" (
    echo [ERROR] vcvars64.bat not found at: %VCVARS%
    echo Visual Studio 2022 Community 설치를 확인하거나 VS_PATH를 수정하세요.
    exit /b 1
)

call "%VCVARS%" >nul
if errorlevel 1 (
    echo [ERROR] vcvars64.bat 호출 실패
    exit /b 1
)

REM Lum 프로젝트 루트로 이동 후 tauri dev with embedded-ai feature
cd /d "%~dp0\.."
npm run tauri -- dev --features embedded-ai %*
