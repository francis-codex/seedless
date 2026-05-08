#!/usr/bin/env sh
# Create MoproBindings-android-jniLibs.zip for upload to CloudFront.
# Run from anywhere: android/create-android-jnilibs-zip.sh
# Output: android/MoproBindings-android-jniLibs.zip

set -e
ANDROID_DIR="$(cd "$(dirname "$0")" && pwd)"
ZIP_OUT="$ANDROID_DIR/MoproBindings-android-jniLibs.zip"
cd "$ANDROID_DIR/src/main/jniLibs"
zip -r "$ZIP_OUT" arm64-v8a x86_64
echo "Created $ZIP_OUT"
