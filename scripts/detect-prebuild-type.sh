#!/bin/sh
# Detect whether the current prebuild output is for phone or TV.
# Fragile heuristic: checks for TV-specific artifacts left by
# @react-native-tvos/config-tv and custom Streamyfin plugins.
#
# Usage: sh scripts/detect-prebuild-type.sh
# Output: phone | tv | unknown



set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$REPO_ROOT/ios"
ANDROID_DIR="$REPO_ROOT/android"

detect_ios() {
	# Marker 1: Podfile uses tvos platform
	if [ -f "$IOS_DIR/Podfile" ] && grep -q "platform :tvos" "$IOS_DIR/Podfile"; then
		printf 'tv\n'; return 0
	fi

	# Marker 2: Xcode project has TV-specific build settings
	pbx="$IOS_DIR/Streamyfin.xcodeproj/project.pbxproj"
	if [ -f "$pbx" ]; then
		if grep -q "TARGETED_DEVICE_FAMILY = 3" "$pbx" 2>/dev/null; then
			printf 'tv\n'; return 0
		fi
		if grep -q "SDKROOT = appletvos" "$pbx" 2>/dev/null; then
			printf 'tv\n'; return 0
		fi
		if grep -q "TVAppIcon" "$pbx" 2>/dev/null; then
			printf 'tv\n'; return 0
		fi
	fi

	# Marker 3: TV app icon asset catalog exists
	if [ -d "$IOS_DIR/Streamyfin/Images.xcassets/TVAppIcon.appiconset" ]; then
		printf 'tv\n'; return 0
	fi

	# Marker 4: .xcode.env.local has EXPO_TV=1
	if [ -f "$IOS_DIR/.xcode.env.local" ] && grep -q "EXPO_TV=1" "$IOS_DIR/.xcode.env.local"; then
		printf 'tv\n'; return 0
	fi

	# If ios dir exists but no TV markers, it's phone
	if [ -d "$IOS_DIR/Streamyfin.xcodeproj" ] || [ -f "$IOS_DIR/Podfile" ]; then
		printf 'phone\n'; return 0
	fi

	return 1
}

detect_android() {
	manifest="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
	if [ -f "$manifest" ]; then
		# Marker 1: leanback feature present
		if grep -q "android.software.leanback" "$manifest"; then
			printf 'tv\n'; return 0
		fi
		# Marker 2: touchscreen explicitly marked not required (TV builds)
		if grep -q 'android.hardware.touchscreen.*required.*false' "$manifest"; then
			printf 'tv\n'; return 0
		fi
		# If manifest exists but no TV markers, it's phone
		printf 'phone\n'; return 0
	fi
	return 1
}

# Prefer iOS detection if available, fall back to Android
if detect_ios 2>/dev/null; then
	exit 0
elif detect_android 2>/dev/null; then
	exit 0
else
	printf 'unknown\n'
	exit 0
fi
