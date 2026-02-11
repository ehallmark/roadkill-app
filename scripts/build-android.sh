#!/bin/bash
set -e

# Android local APK build script
# Usage: ./scripts/build-android.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Set up environment
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

echo "==> ANDROID_HOME=$ANDROID_HOME"
echo "==> JAVA_HOME=$JAVA_HOME"

# Verify prerequisites
if [ ! -d "$ANDROID_HOME" ]; then
  echo "ERROR: Android SDK not found at $ANDROID_HOME"
  echo "Install Android Studio or set ANDROID_HOME"
  exit 1
fi

if [ ! -d "$JAVA_HOME" ]; then
  echo "ERROR: Java not found at $JAVA_HOME"
  echo "Install Android Studio or set JAVA_HOME"
  exit 1
fi

# Install JS dependencies
echo "==> Installing dependencies..."
npm ci

# Generate native Android project
echo "==> Running expo prebuild..."
npx expo prebuild --platform android --clean

# Make gradlew executable
chmod +x android/gradlew

# Build APK
echo "==> Building release APK..."
cd android
./gradlew assembleRelease --no-daemon
cd ..

# Find and copy APK to project root
APK_PATH=$(find android/app/build/outputs/apk/release -name "*.apk" | head -1)
if [ -n "$APK_PATH" ]; then
  cp "$APK_PATH" "$PROJECT_DIR/roadkill-tracker.apk"
  echo ""
  echo "==> BUILD SUCCESSFUL"
  echo "==> APK: $PROJECT_DIR/roadkill-tracker.apk"
  echo ""
  echo "To install on emulator/device:"
  echo "  adb install roadkill-tracker.apk"
else
  echo "ERROR: APK not found after build"
  exit 1
fi
