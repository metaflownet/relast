#!/usr/bin/env bash

set -euo pipefail

APP_NAME="ReLast Tab"
BUNDLE_IDENTIFIER="local.florin.ReLast-Tab"
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIRECTORY="${SCRIPT_DIRECTORY}/extension"
EXTENSION_VERSION="$(awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "${EXTENSION_DIRECTORY}/manifest.json")"
USER_APPLICATIONS_DIRECTORY="${HOME}/Applications"
TARGET_APPLICATION="${USER_APPLICATIONS_DIRECTORY}/${APP_NAME}.app"
BUILD_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/relast-tab-installer.XXXXXX")"

cleanup() {
  rm -rf "${BUILD_DIRECTORY}"
}
trap cleanup EXIT

if ! command -v xcrun >/dev/null 2>&1 || ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Xcode is required. Install it from the Mac App Store and try again." >&2
  exit 1
fi

PACKAGER="$(xcrun --find safari-web-extension-packager 2>/dev/null || true)"
if [[ -z "${PACKAGER}" ]]; then
  PACKAGER="$(xcrun --find safari-web-extension-converter 2>/dev/null || true)"
fi
if [[ -z "${PACKAGER}" ]]; then
  echo "Safari's Web Extension Packager was not found in the active Xcode." >&2
  exit 1
fi

echo "Packaging ${APP_NAME}…"
"${PACKAGER}" "${EXTENSION_DIRECTORY}" \
  --project-location "${BUILD_DIRECTORY}" \
  --app-name "${APP_NAME}" \
  --bundle-identifier "${BUNDLE_IDENTIFIER}" \
  --swift \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt

PROJECT="${BUILD_DIRECTORY}/${APP_NAME}/${APP_NAME}.xcodeproj"
DERIVED_DATA="${BUILD_DIRECTORY}/DerivedData"

echo "Building ${APP_NAME}…"
if [[ -n "${DEVELOPMENT_TEAM_ID:-}" ]]; then
  xcodebuild -quiet \
    -project "${PROJECT}" \
    -scheme "${APP_NAME}" \
    -configuration Release \
    -derivedDataPath "${DERIVED_DATA}" \
    -destination "platform=macOS" \
    -allowProvisioningUpdates \
    CODE_SIGN_STYLE=Automatic \
    DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM_ID}" \
    MARKETING_VERSION="${EXTENSION_VERSION}" \
    CURRENT_PROJECT_VERSION=1 \
    build
else
  xcodebuild -quiet \
    -project "${PROJECT}" \
    -scheme "${APP_NAME}" \
    -configuration Release \
    -derivedDataPath "${DERIVED_DATA}" \
    -destination "platform=macOS" \
    CODE_SIGN_STYLE=Manual \
    CODE_SIGN_IDENTITY=- \
    DEVELOPMENT_TEAM= \
    MARKETING_VERSION="${EXTENSION_VERSION}" \
    CURRENT_PROJECT_VERSION=1 \
    build
fi

BUILT_APPLICATION="${DERIVED_DATA}/Build/Products/Release/${APP_NAME}.app"
codesign --verify --deep --strict "${BUILT_APPLICATION}"

mkdir -p "${USER_APPLICATIONS_DIRECTORY}"
if [[ -e "${TARGET_APPLICATION}" ]]; then
  rm -rf "${TARGET_APPLICATION}"
fi
/usr/bin/ditto "${BUILT_APPLICATION}" "${TARGET_APPLICATION}"
codesign --verify --deep --strict "${TARGET_APPLICATION}"

echo "Installed ${TARGET_APPLICATION}"
open "${TARGET_APPLICATION}"

echo
echo "Final Safari step:"
if [[ -z "${DEVELOPMENT_TEAM_ID:-}" ]]; then
  echo "  1. If needed, enable Safari Settings → Developer → Allow unsigned extensions."
  echo "  2. This unsigned-development setting resets when Safari quits."
  echo "  3. Open Safari Settings → Extensions and enable ReLast Tab."
else
  echo "  Open Safari Settings → Extensions and enable ReLast Tab once."
fi
echo "Remove the temporary copy first if Safari shows ReLast Tab twice."
