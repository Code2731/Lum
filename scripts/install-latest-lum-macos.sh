#!/usr/bin/env bash
set -euo pipefail

# macOS에서 아키텍처에 맞는 최신 LUM DMG를 받아 바로 설치하는 스크립트.
REPO="Code2731/Lum"
APP_NAME="LUM Terminal.app"
APP_BASENAME="LUM Terminal"
DMG_FILE=""
MOUNT_POINT=""
TMPDIR=""
CP_ERROR_LOG=""

cleanup() {
  local rc=$?
  if [ -n "$MOUNT_POINT" ] && mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
    hdiutil detach "$MOUNT_POINT" -quiet || true
  fi
  if [ -n "$DMG_FILE" ] && [ -f "$DMG_FILE" ]; then
    rm -f "$DMG_FILE"
  fi
  if [ -n "$TMPDIR" ] && [ -d "$TMPDIR" ]; then
    rmdir "$TMPDIR" 2>/dev/null || true
  fi
  [ -n "$CP_ERROR_LOG" ] && [ -f "$CP_ERROR_LOG" ] && rm -f "$CP_ERROR_LOG"
  return $rc
}
trap cleanup EXIT

if [ "$(uname)" != "Darwin" ]; then
  echo "이 스크립트는 macOS에서만 동작합니다." >&2
  exit 1
fi

machine="$(uname -m)"
case "$machine" in
  arm64 | aarch64)
    ARCH="aarch64"
    ;;
  x86_64 | amd64)
    ARCH="x64"
    ;;
  *)
    echo "지원하지 않는 CPU 아키텍처: $machine" >&2
    echo "intel/amd64 또는 arm64/aarch64 만 지원합니다." >&2
    exit 1
    ;;
esac

echo "감지된 아키텍처: $machine => $ARCH"

RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")"
read -r DMG_URL DMG_NAME < <(
  python3 - "$ARCH" <<'PY'
import json,sys
arch = sys.argv[1]
data = json.loads(sys.stdin.read())
assets = data.get("assets", [])

def is_target(name: str) -> bool:
    if not name.endswith(".dmg"):
        return False
    if arch == "aarch64":
        return "_aarch64.dmg" in name
    return "_x64.dmg" in name or "_x86_64.dmg" in name

for a in assets:
    name = a.get("name", "")
    if is_target(name):
        print(a.get("browser_download_url", ""), name)
        break
PY
)

if [ -z "${DMG_URL}" ]; then
  echo "현재 릴리스에서 현재 아키텍처용 DMG를 찾지 못했습니다." >&2
  echo "수동 확인: https://github.com/${REPO}/releases/latest" >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
DMG_FILE="${TMPDIR}/${DMG_NAME}"

echo "DMG 다운로드: $DMG_NAME"
curl -L -o "$DMG_FILE" "$DMG_URL"
echo "다운로드 완료: $DMG_FILE"

echo "격리 플래그 제거 중..."
xattr -dr com.apple.quarantine "$DMG_FILE" 2>/dev/null || true

echo "DMG 마운트..."
MOUNT_INFO="$(hdiutil attach "$DMG_FILE" -nobrowse -readonly -noverify -plist)"
MOUNT_POINT="$(printf '%s' "$MOUNT_INFO" | python3 - <<'PY'
import plistlib
import sys

data = plistlib.loads(sys.stdin.buffer.read())
for item in data.get("system-entities", []):
    mount_point = item.get("mount-point")
    if mount_point:
        print(mount_point)
        break
PY
)"

if [ -z "$MOUNT_POINT" ] || [ ! -d "$MOUNT_POINT" ]; then
  echo "DMG 마운트 지점 추출에 실패했습니다." >&2
  exit 1
fi

APP_SOURCE="${MOUNT_POINT}/${APP_NAME}"
if [ ! -d "$APP_SOURCE" ]; then
  APP_SOURCE="$(find "$MOUNT_POINT" -maxdepth 2 -name "${APP_NAME}" -type d | head -n 1)"
fi
if [ -z "${APP_SOURCE}" ] || [ ! -d "$APP_SOURCE" ]; then
  echo "설치 패키지 내에서 ${APP_NAME}을(를) 찾지 못했습니다." >&2
  exit 1
fi

TARGET_DIR="/Applications"
INSTALL_PATH="${TARGET_DIR}/${APP_BASENAME}"
CP_ERROR_LOG="$(mktemp)"
if ! cp -R "$APP_SOURCE" "$TARGET_DIR/" 2>"$CP_ERROR_LOG"; then
  echo "권한이 없어 /Applications 쓰기가 실패했습니다. ~/Applications으로 대체 설치합니다." >&2
  TARGET_DIR="${HOME}/Applications"
  mkdir -p "$TARGET_DIR"
  if ! cp -R "$APP_SOURCE" "$TARGET_DIR/" 2>"$CP_ERROR_LOG"; then
    echo "설치 실패: $APP_SOURCE -> $TARGET_DIR"
    echo "세부 오류: $(cat "$CP_ERROR_LOG")" >&2
    exit 1
  fi
  INSTALL_PATH="${TARGET_DIR}/${APP_BASENAME}"
fi

echo "설치 완료: ${INSTALL_PATH}"
xattr -dr com.apple.quarantine "$INSTALL_PATH" 2>/dev/null || true
echo "미서명 앱은 맥 첫 실행 시 우클릭 → 열기 필요할 수 있습니다."

echo "${INSTALL_PATH} 실행을 시작합니다."
open -a "$INSTALL_PATH" || {
  echo "자동 실행에 실패했습니다. 다음을 직접 실행해 주세요:"
  echo "  open -a \"$INSTALL_PATH\""
  exit 1
}
