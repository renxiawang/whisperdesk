#!/bin/bash
# Build the apple-translator Swift CLI for WhisperDesk.
# Requires Xcode with macOS 26+ SDK (for the Translation framework direct init).
# Produces bin/apple-translator for the current architecture (arm64 on Apple Silicon).

set -eo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SWIFT_SRC="$PROJECT_DIR/swift/Translator/main.swift"
BIN_DIR="$PROJECT_DIR/bin"

if ! command -v swiftc &>/dev/null; then
    echo "❌ swiftc not found. Install Xcode Command Line Tools: xcode-select --install"
    exit 1
fi

# Confirm the SDK has the macOS 26 Translation framework available.
SDK_PATH=$(xcrun --show-sdk-path 2>/dev/null || true)
if [ -z "$SDK_PATH" ]; then
    echo "❌ Could not find Xcode SDK. Make sure Xcode is installed."
    exit 1
fi

mkdir -p "$BIN_DIR"

echo "🔨 Building apple-translator ($(uname -m))..."
swiftc \
    -O \
    -framework Translation \
    -sdk "$SDK_PATH" \
    "$SWIFT_SRC" -o "$BIN_DIR/apple-translator"

chmod +x "$BIN_DIR/apple-translator"
echo "✅ apple-translator built: $BIN_DIR/apple-translator"
