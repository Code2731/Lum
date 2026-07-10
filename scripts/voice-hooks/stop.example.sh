#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${HOME}/.lum_whisper"
TRANSCRIPT_FILE="${STATE_DIR}/last_transcript.txt"
RECORDER_PID_FILE="${STATE_DIR}/recording.pid"
PARTIAL_PID_FILE="${STATE_DIR}/partial.pid"
AUDIO_FILE="${STATE_DIR}/recording.wav"

# 이 파일은 템플릿이다.
# ~/.lum_whisper/stop.sh 로 복사한 뒤 실제 종료/STT 명령으로 교체한다.

if [ -f "${PARTIAL_PID_FILE}" ]; then
  kill "$(cat "${PARTIAL_PID_FILE}")" 2>/dev/null || true
  rm -f "${PARTIAL_PID_FILE}"
fi

if [ -f "${RECORDER_PID_FILE}" ]; then
  kill "$(cat "${RECORDER_PID_FILE}")" 2>/dev/null || true
  rm -f "${RECORDER_PID_FILE}"
fi

# 실제 STT 예시:
# FINAL_TEXT="$(python3 transcribe.py "${AUDIO_FILE}")"
# printf '%s\n' "${FINAL_TEXT}" > "${TRANSCRIPT_FILE}"
# printf '%s\n' "${FINAL_TEXT}"

# 최종 transcript를 stdout 으로 주지 않는 경우에도,
# last_transcript.txt 에 최종 문장을 쓰면 LUM이 fallback으로 읽는다.
if [ -f "${TRANSCRIPT_FILE}" ]; then
  cat "${TRANSCRIPT_FILE}"
fi

exit 0
