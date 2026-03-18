#!/bin/bash
# Build the speech-capture Swift CLI for WhisperDesk.
# Combines ScreenCaptureKit (system audio) with SFSpeechRecognizer (on-device transcription).
# Requires Xcode Command Line Tools.  Produces bin/speech-capture.

set -eo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SWIFT_SRC="$PROJECT_DIR/swift/SpeechCapture/main.swift"
BIN_DIR="$PROJECT_DIR/bin"

if ! command -v swiftc &>/dev/null; then
    echo "❌ swiftc not found. Install Xcode Command Line Tools: xcode-select --install"
    exit 1
fi

SDK_PATH=$(xcrun --show-sdk-path 2>/dev/null || true)
if [ -z "$SDK_PATH" ]; then
    echo "❌ Could not find Xcode SDK. Make sure Xcode is installed."
    exit 1
fi

mkdir -p "$BIN_DIR"

echo "🔨 Building speech-capture ($(uname -m))..."
swiftc \
    -O \
    -framework Speech \
    -framework ScreenCaptureKit \
    -framework CoreMedia \
    -framework AVFoundation \
    -sdk "$SDK_PATH" \
    "$SWIFT_SRC" -o "$BIN_DIR/speech-capture"

chmod +x "$BIN_DIR/speech-capture"
echo "✅ speech-capture built: $BIN_DIR/speech-capture"
