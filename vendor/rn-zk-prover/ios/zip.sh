#!/usr/bin/env sh
# Create MoproBindings.xcframework.zip for upload to CloudFront.
# Run from anywhere: MoproReactNativeBindings/ios/create-ios-xcframework-zip.sh
# Output: MoproReactNativeBindings/ios/MoproBindings.xcframework.zip

set -e
IOS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$IOS_DIR/.." && pwd)"
ZIP_OUT="$IOS_DIR/MoproBindings.xcframework.zip"
STAGING="$IOS_DIR/_staging"

mkdir -p "$STAGING"
cp -R "$ROOT_DIR/MoproFfiFramework.xcframework" "$STAGING/MoproBindings.xcframework"
cd "$STAGING"
zip -r "$ZIP_OUT" MoproBindings.xcframework -x "*.DS_Store"
rm -rf "$STAGING"
echo "Created $ZIP_OUT"`