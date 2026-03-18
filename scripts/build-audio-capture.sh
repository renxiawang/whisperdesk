#!/bin/bash
# Build the audio-capture Swift CLI for WhisperDesk.
# Requires Xcode Command Line Tools (swiftc).
# Produces bin/audio-capture (universal or current-arch).

set -eo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SWIFT_SRC="$PROJECT_DIR/swift/AudioCapture/main.swift"
BIN_DIR="$PROJECT_DIR/bin"
UNIVERSAL=false

if [ "$1" = "--universal" ]; then
    UNIVERSAL=true
fi

if ! command -v swiftc &>/dev/null; then
    echo "❌ swiftc not found. Install Xcode Command Line Tools: xcode-select --install"
    exit 1
fi

mkdir -p "$BIN_DIR"

SWIFT_FLAGS=(
    -O
    -framework ScreenCaptureKit
    -framework CoreMedia
    -framework AVFoundation
)

if [ "$UNIVERSAL" = true ]; then
    echo "🔨 Building audio-capture (universal binary)..."

    swiftc "${SWIFT_FLAGS[@]}" -target arm64-apple-macos13.0 \
        "$SWIFT_SRC" -o "$BIN_DIR/audio-capture-arm64"

    swiftc "${SWIFT_FLAGS[@]}" -target x86_64-apple-macos13.0 \
        "$SWIFT_SRC" -o "$BIN_DIR/audio-capture-x86_64"

    lipo -create \
        "$BIN_DIR/audio-capture-arm64" \
        "$BIN_DIR/audio-capture-x86_64" \
        -output "$BIN_DIR/audio-capture"

    rm -f "$BIN_DIR/audio-capture-arm64" "$BIN_DIR/audio-capture-x86_64"
    echo "   Universal binary: $(lipo -info "$BIN_DIR/audio-capture")"
else
    echo "🔨 Building audio-capture (current architecture)..."
    swiftc "${SWIFT_FLAGS[@]}" -target "$(uname -m)-apple-macos13.0" \
        "$SWIFT_SRC" -o "$BIN_DIR/audio-capture"
fi

chmod +x "$BIN_DIR/audio-capture"
echo "✅ audio-capture built: $BIN_DIR/audio-capture"
