#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${HOME}/.lum_whisper"
TRANSCRIPT_FILE="${STATE_DIR}/last_transcript.txt"
RECORDER_PID_FILE="${STATE_DIR}/recording.pid"
PARTIAL_PID_FILE="${STATE_DIR}/partial.pid"
AUDIO_FILE="${STATE_DIR}/recording.wav"

mkdir -p "${STATE_DIR}"
rm -f "${TRANSCRIPT_FILE}" "${RECORDER_PID_FILE}" "${PARTIAL_PID_FILE}" "${AUDIO_FILE}"

# 이 파일은 템플릿이다.
# ~/.lum_whisper/start.sh 로 복사한 뒤 실제 녹음/STT 명령으로 교체한다.

# 1) 실제 녹음 프로세스를 백그라운드로 시작한다.
# ffmpeg -f avfoundation -i ":0" -ac 1 -ar 16000 "${AUDIO_FILE}" >/dev/null 2>&1 &
# echo $! > "${RECORDER_PID_FILE}"

# 2) partial transcript를 last_transcript.txt 에 계속 덮어쓴다.
# 아래 블록은 예시일 뿐이며, 실제 STT 명령으로 바꿔야 한다.
# (
#   while kill -0 "$(cat "${RECORDER_PID_FILE}")" 2>/dev/null; do
#     printf '%s\n' "듣는 중..." > "${TRANSCRIPT_FILE}"
#     sleep 0.4
#   done
# ) &
# echo $! > "${PARTIAL_PID_FILE}"

exit 0
