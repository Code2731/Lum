@echo off
setlocal

set "STATE_DIR=%USERPROFILE%\.lum_whisper"
set "TRANSCRIPT_FILE=%STATE_DIR%\last_transcript.txt"
set "RECORDER_PID_FILE=%STATE_DIR%\recording.pid"
set "PARTIAL_PID_FILE=%STATE_DIR%\partial.pid"
set "AUDIO_FILE=%STATE_DIR%\recording.wav"

if not exist "%STATE_DIR%" mkdir "%STATE_DIR%"
if exist "%TRANSCRIPT_FILE%" del /f /q "%TRANSCRIPT_FILE%"
if exist "%RECORDER_PID_FILE%" del /f /q "%RECORDER_PID_FILE%"
if exist "%PARTIAL_PID_FILE%" del /f /q "%PARTIAL_PID_FILE%"
if exist "%AUDIO_FILE%" del /f /q "%AUDIO_FILE%"

rem 이 파일은 템플릿이다.
rem %%USERPROFILE%%\.lum_whisper\start.cmd 로 복사한 뒤 실제 녹음/STT 명령으로 교체한다.

rem 1) 실제 녹음 프로세스를 시작한다.
rem start "" /b your-recorder.exe --out "%AUDIO_FILE%"

rem 2) partial transcript를 last_transcript.txt 에 계속 덮어쓴다.
rem 아래는 예시 placeholder 이며 실제 STT 파이프라인으로 바꿔야 한다.
rem powershell -NoProfile -Command ^
rem   "while ($true) { Set-Content -Path '%TRANSCRIPT_FILE%' -Value '듣는 중...'; Start-Sleep -Milliseconds 400 }"

exit /b 0
