@echo off
setlocal

set "STATE_DIR=%USERPROFILE%\.lum_whisper"
set "TRANSCRIPT_FILE=%STATE_DIR%\last_transcript.txt"
set "RECORDER_PID_FILE=%STATE_DIR%\recording.pid"
set "PARTIAL_PID_FILE=%STATE_DIR%\partial.pid"
set "AUDIO_FILE=%STATE_DIR%\recording.wav"

rem 이 파일은 템플릿이다.
rem %%USERPROFILE%%\.lum_whisper\stop.cmd 로 복사한 뒤 실제 종료/STT 명령으로 교체한다.

rem 실제 STT 예시:
rem for /f "usebackq delims=" %%I in (`python transcribe.py "%AUDIO_FILE%"`) do set "FINAL_TEXT=%%I"
rem > "%TRANSCRIPT_FILE%" echo %FINAL_TEXT%
rem echo %FINAL_TEXT%

if exist "%TRANSCRIPT_FILE%" type "%TRANSCRIPT_FILE%"

exit /b 0
