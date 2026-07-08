#!/usr/bin/env bash
set -euo pipefail

# Linux CPU 산출물의 deb/appimage 번들 존재 여부를 스모크로 검증합니다.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEB_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/deb"
APPIMAGE_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/appimage"

if [ ! -d "${DEB_DIR}" ]; then
  echo "Linux deb 번들 디렉터리가 없습니다: ${DEB_DIR}"
  exit 1
fi

if [ ! -d "${APPIMAGE_DIR}" ]; then
  echo "Linux AppImage 번들 디렉터리가 없습니다: ${APPIMAGE_DIR}"
  exit 1
fi

shopt -s nullglob
DEB_FILES=("${DEB_DIR}"/*.deb)
APPIMAGE_FILES=("${APPIMAGE_DIR}"/*.AppImage)

if [ "${#DEB_FILES[@]}" -eq 0 ]; then
  echo "Linux deb 파일이 없습니다."
  exit 1
fi

if [ "${#APPIMAGE_FILES[@]}" -eq 0 ]; then
  echo "Linux AppImage 파일이 없습니다."
  exit 1
fi

for path in "${DEB_FILES[@]}" "${APPIMAGE_FILES[@]}"; do
  if [ ! -f "${path}" ] || [ ! -s "${path}" ]; then
    echo "유효하지 않은 산출물: ${path}"
    exit 1
  fi
  echo "OK: $(basename "${path}")"
done

echo "Linux CPU smoke artifact check passed."
