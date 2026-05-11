#!/usr/bin/env bash
set -euo pipefail

# macOS에서 현재 머신 아키텍처에 맞는 최신 LUM DMG를 자동으로 받아오는 스크립트.
REPO="Code2731/Lum"

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

RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")
DMG_URL=$(python3 - "$ARCH" <<'PY'
import json
import sys

arch = sys.argv[1]
data = json.loads(sys.stdin.read())

def is_target(name: str) -> bool:
    if not name.endswith(".dmg"):
        return False
    if arch == "aarch64":
        return "_aarch64.dmg" in name
    return "_x64.dmg" in name or "_x86_64.dmg" in name

assets = data.get("assets", [])
matches = [a.get("browser_download_url") for a in assets if is_target(a.get("name", ""))]
if matches:
    print(matches[0])
PY
 <<< "$RELEASE_JSON")

if [ -z "$DMG_URL" ]; then
  echo "현재 릴리스에서 현재 아키텍처용 DMG를 찾지 못했습니다." >&2
  echo "수동 확인: https://github.com/$REPO/releases/latest" >&2
  exit 1
fi

OUTPUT="LUM.Terminal.${ARCH}.dmg"
echo "다운로드: $DMG_URL"
curl -L -o "$OUTPUT" "$DMG_URL"
echo "저장 완료: $OUTPUT"
echo "실행 전 권한 해제: xattr -dr com.apple.quarantine \"$PWD/$OUTPUT\""
