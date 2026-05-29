MAESTRO_BIN ?= $(HOME)/.maestro/bin
export PATH := $(MAESTRO_BIN):$(PATH)

.DEFAULT_GOAL := help

.PHONY: help e2e e2e-setup ensure-prebuild-phone ensure-prebuild-tv run-android run-android-tv run-ios clean-artifacts install-android install-android-tv install-ios test-android test-android-cf test-android-record test-android-record-maestro test-android-record-adb test-ios test-ios-record test-ios-record-maestro test-ios-record-simulator test-ios-cf test-play-steamboat test-android-tv test-android-tv-cf jellyfin-save-config jellyfin-up jellyfin-up-clean jellyfin-down jellyfin-status jellyfin-logs jellyfin-api-test jellyfin-init

ENV_FILE ?= tests/ui-testing/.env.local

help:
	@printf '\n%s\n' 'Streamyfin targets'
	@printf '%s\n\n' 'Usage: make <target> [ENV_FILE=tests/ui-testing/.env.jeef]'
	@printf '%s\n' 'Environment'
	@printf '  %-28s %s\n' 'ENV_FILE' 'Env file for Maestro tests (default: tests/ui-testing/.env.local)'
	@printf '%s\n' 'Setup'
	@printf '  %-28s %s\n' 'help' 'Show this help.'
	@printf '  %-28s %s\n' 'e2e-setup' 'Install the Maestro CLI.'
	@printf '  %-28s %s\n' 'ensure-prebuild-phone' 'Prebuild phone only when needed.'
	@printf '  %-28s %s\n' 'ensure-prebuild-tv' 'Prebuild TV only when needed.'
	@printf '  %-28s %s\n\n' 'clean-artifacts' 'Remove local UI test screenshots.'
	@printf '%s\n' 'Run development builds'
	@printf '  %-28s %s\n' 'run-android' 'Ensure phone prebuild, then run Android.'
	@printf '  %-28s %s\n' 'run-android-tv' 'Ensure TV prebuild, then run Android TV.'
	@printf '  %-28s %s\n\n' 'run-ios' 'Ensure phone prebuild, then run iOS.'
	@printf '%s\n' 'Install UI test builds'
	@printf '  %-28s %s\n' 'install-android' 'Ensure phone prebuild, then install Android release.'
	@printf '  %-28s %s\n' 'install-android-tv' 'Ensure TV prebuild, then install Android TV release.'
	@printf '  %-28s %s\n\n' 'install-ios' 'Ensure phone prebuild, then install iOS release.'
	@printf '%s\n' 'Android phone UI tests'
	@printf '  %-28s %s\n' 'test-android' 'Run SimpleFlow from a cleared app launch.'
	@printf '  %-28s %s\n' 'test-android-cf' 'Run Cloudflare flow from a cleared app launch.'
	@printf '  %-28s %s\n' 'test-android-record-maestro' 'Record Android login flow via maestro.'
	@printf '  %-28s %s\n' 'test-android-record-adb' 'Record Android login flow via adb.'
	@printf '  %-28s %s\n\n' 'test-android-record' 'Both maestro + adb recordings (combined).'
	@printf '%s\n' 'iOS phone UI tests'
	@printf '  %-28s %s\n' 'test-ios' 'Run iOS SimpleFlow from a cleared app launch.'
	@printf '  %-28s %s\n' 'test-ios-record-maestro' 'Record iOS login flow via maestro (script overlay).'
	@printf '  %-28s %s\n' 'test-ios-record-simulator' 'Record iOS login flow via simctl (clean screen only).'
	@printf '  %-28s %s\n' 'test-ios-record' 'Both maestro + simctl recordings (combined).'
	@printf '  %-28s %s\n' 'test-ios-cf' 'Run iOS Cloudflare flow from a cleared app launch.'
	@printf '  %-28s %s\n\n' 'test-play-steamboat' 'Play Steamboat Willie from home screen (requires login).'
	@printf '%s\n' 'Android TV UI tests'
	@printf '  %-28s %s\n' 'test-android-tv' 'Run TV SimpleFlow from a cleared app launch.'
	@printf '  %-28s %s\n\n' 'test-android-tv-cf' 'Run TV Cloudflare flow from a cleared app launch.'
	@printf '%s\n' 'Legacy'
	@printf '  %-28s %s\n\n' 'e2e' 'Start Maestro Android device and run login.yaml.'
	@printf '%s\n' 'Jellyfin Test Fixture'
	@printf '  %-28s %s\n' 'jellyfin-up' 'Start Jellyfin with external URL configured'
	@printf '  %-28s %s\n' 'jellyfin-up-clean' 'Start Jellyfin (blank slate, no config)'
	@printf '  %-28s %s\n' 'jellyfin-down' 'Stop Jellyfin container'
	@printf '  %-28s %s\n' 'jellyfin-status' 'Check Jellyfin status'
	@printf '  %-28s %s\n' 'jellyfin-logs' 'Show Jellyfin logs'
	@printf '  %-28s %s\n' 'jellyfin-api-test' 'Test Jellyfin API connectivity'
	@printf '  %-28s %s\n' 'jellyfin-init' 'Auto-initialize a blank Jellyfin instance'
	@printf '  %-28s %s\n\n' 'jellyfin-save-config' 'Save config to base_config/'

e2e:
	maestro start-device --platform android
	maestro test login.yaml

e2e-setup:
	curl -fsSL "https://get.maestro.mobile.dev" | bash

ensure-prebuild-phone:
	@prebuild_type=$$(sh scripts/detect-prebuild-type.sh); \
	if [ "$$prebuild_type" = "phone" ]; then \
		printf '%s\n' 'Prebuild already matches phone; skipping bun run prebuild.'; \
	else \
		printf 'Current prebuild type: %s; running bun run prebuild.\n' "$$prebuild_type"; \
		bun run prebuild; \
	fi

ensure-prebuild-tv:
	@prebuild_type=$$(sh scripts/detect-prebuild-type.sh); \
	if [ "$$prebuild_type" = "tv" ]; then \
		printf '%s\n' 'Prebuild already matches TV; skipping bun run prebuild:tv.'; \
	else \
		printf 'Current prebuild type: %s; running bun run prebuild:tv.\n' "$$prebuild_type"; \
		bun run prebuild:tv; \
	fi

run-android: ensure-prebuild-phone
	bun run android

run-android-tv: ensure-prebuild-tv
	bun run android:tv

run-ios: ensure-prebuild-phone
	bun run ios

clean-artifacts:
	find tests/ui-testing/artifacts -mindepth 1 -maxdepth 1 ! -name .gitkeep -exec rm -rf {} +

install-android: ensure-prebuild-phone
	bun run android:ui-test

install-android-tv: ensure-prebuild-tv
	bun run android:tv:ui-test

install-ios: ensure-prebuild-phone
	bun run ios:ui-test

test-android:
	sh tests/ui-testing/run-flow.sh simple

test-android-cf:
	sh tests/ui-testing/run-flow.sh cf

# --- Android recording targets ---
test-android-record-maestro:
	mkdir -p tests/ui-testing/artifacts
	@set -a; . $(ENV_FILE); set +a; \
	export MAESTRO_ARTIFACT_DIR=tests/ui-testing/artifacts; \
	maestro record tests/ui-testing/flows/simple-flow.yaml tests/ui-testing/artifacts/android-login-flow.mp4

test-android-record-adb:
	mkdir -p tests/ui-testing/artifacts
	@printf 'Checking for connected Android device...\n'
	@if ! adb devices | grep -q "device$$"; then \
	  printf 'Error: No Android device connected.\n' >&2; \
	  printf 'Start one with: maestro start-device --platform android\n' >&2; \
	  exit 1; \
	fi
	@set -a; . $(ENV_FILE); set +a; \
	DEVICE=$$(adb devices | grep "device$$" | head -1 | cut -f1); \
	printf 'Found device: %s\n' "$$DEVICE"; \
	VIDEO="tests/ui-testing/artifacts/android-login-flow-adb.mp4"; \
	rm -f "$$VIDEO"; \
	printf 'Launching app...\n'; \
	maestro test tests/ui-testing/flows/_launch.yaml 2>/dev/null || true; \
	printf 'Waiting for app to stabilize...\n'; \
	sleep 5; \
	printf 'Starting adb screen recording...\n'; \
	adb shell screenrecord /sdcard/screenrecord.mp4 & \
	ADB_PID=$$!; \
	sleep 1; \
	printf 'Running login flow (app already open)...\n'; \
	maestro test tests/ui-testing/flows/_enter-server-and-login.yaml; \
	TEST_STATUS=$$?; \
	printf 'Stopping adb screen recording...\n'; \
	kill $$ADB_PID 2>/dev/null || true; \
	wait $$ADB_PID 2>/dev/null || true; \
	sleep 1; \
	adb pull /sdcard/screenrecord.mp4 "$$VIDEO" 2>/dev/null || true; \
	adb shell rm /sdcard/screenrecord.mp4 2>/dev/null || true; \
	if [ -f "$$VIDEO" ] && [ -s "$$VIDEO" ]; then \
	  FILE_SIZE=$$(stat -f%z "$$VIDEO" 2>/dev/null || stat -c%s "$$VIDEO" 2>/dev/null || echo "0"); \
	  printf 'Recording saved: %s (%s bytes)\n' "$$VIDEO" "$$FILE_SIZE"; \
	else \
	  printf 'Warning: Recording file is missing or empty.\n' >&2; \
	fi; \
	exit $$TEST_STATUS

# --- Combined: both maestro + adb recordings ---
test-android-record: test-android-record-maestro test-android-record-adb

test-ios:
	sh tests/ui-testing/run-flow.sh ios-simple

# --- Maestro recording (script overlay + device frame) ---
test-ios-record-maestro:
	mkdir -p tests/ui-testing/artifacts
	@set -a; . $(ENV_FILE); set +a; \
	export MAESTRO_ARTIFACT_DIR=tests/ui-testing/artifacts; \
	maestro record --local tests/ui-testing/flows/ios-simple-flow.yaml tests/ui-testing/artifacts/ios-login-flow.mp4

# --- Simulator-only recording (clean screen, no overlay) ---
test-ios-record-simulator:
	mkdir -p tests/ui-testing/artifacts
	@# Check for booted simulator first
	@printf 'Checking for booted simulator...\n'
	@if ! xcrun simctl list devices | grep -q "(Booted)"; then \
	  printf 'Error: No simulator is booted.\n' >&2; \
	  printf 'Start one with: xcrun simctl boot \"iPhone 16\"\n' >&2; \
	  printf 'Or use Maestro: maestro start-device --platform ios\n' >&2; \
	  exit 1; \
	fi
	@BOOTED_DEVICE=$$(xcrun simctl list devices | grep "(Booted)" | head -1 | sed 's/(Booted).*//'); \
	printf "Found booted device: $$BOOTED_DEVICE\n"
	@# Check and kill any existing simctl recordings (use [o] to avoid pgrep self-match)
	@printf 'Checking for existing simctl recordings...\n'
	@if pgrep -f "simctl io booted recordVide[o]" > /dev/null; then \
	  printf 'Found existing recording process. Killing...\n'; \
	  pgrep -f "simctl io booted recordVide[o]" | while read pid; do \
	    printf "  Killing PID: $$pid\n"; \
	    kill -INT $$pid 2>/dev/null || true; \
	  done; \
	  sleep 2; \
	else \
	  printf 'No existing recordings found.\n'; \
	fi
	@set -a; . $(ENV_FILE); set +a; \
	export MAESTRO_ARTIFACT_DIR=tests/ui-testing/artifacts; \
	SIM_VIDEO="tests/ui-testing/artifacts/ios-login-flow-simulator.mov"; \
	SIM_LOG="/tmp/simctl-$$$$.log"; \
	rm -f "$$SIM_VIDEO" "$$SIM_LOG"; \
	printf 'Starting simulator screen recording...\n'; \
	xcrun simctl io booted recordVideo --codec=h264 --force "$$SIM_VIDEO" > "$$SIM_LOG" 2>&1 & \
	SIMCTL_PID=$$!; \
	sleep 3; \
	if ! kill -0 $$SIMCTL_PID 2>/dev/null; then \
	  if grep -q "Resource busy" "$$SIM_LOG" 2>/dev/null; then \
	    printf 'Stale recording lock detected. Rebooting simulator to clear lock...\n'; \
	    xcrun simctl shutdown booted; \
	    sleep 3; \
	    xcrun simctl boot booted; \
	    sleep 8; \
	    rm -f "$$SIM_LOG"; \
	    printf 'Retrying simulator screen recording...\n'; \
	    xcrun simctl io booted recordVideo --codec=h264 --force "$$SIM_VIDEO" > "$$SIM_LOG" 2>&1 & \
	    SIMCTL_PID=$$!; \
	    sleep 3; \
	    if ! kill -0 $$SIMCTL_PID 2>/dev/null; then \
	      printf 'Error: simctl recording failed even after simulator reboot.\n' >&2; \
	      cat "$$SIM_LOG" >&2; \
	      exit 1; \
	    fi; \
	  else \
	    printf 'Error: simctl recording failed to start.\n' >&2; \
	    cat "$$SIM_LOG" >&2; \
	    exit 1; \
	  fi; \
	fi; \
	printf 'Recording started. Running maestro test...\n'; \
	maestro test tests/ui-testing/flows/ios-simple-flow.yaml; \
	TEST_STATUS=$$?; \
	printf 'Stopping simulator recording (this may take a few seconds)...\n'; \
	kill -INT $$SIMCTL_PID 2>/dev/null || true; \
	wait $$SIMCTL_PID 2>/dev/null || true; \
	sleep 3; \
	if [ -f "$$SIM_VIDEO" ] && [ -s "$$SIM_VIDEO" ]; then \
	  FILE_SIZE=$$(stat -f%z "$$SIM_VIDEO" 2>/dev/null || stat -c%s "$$SIM_VIDEO" 2>/dev/null || echo "0"); \
	  printf 'Simulator recording saved: %s (%s bytes)\n' "$$SIM_VIDEO" "$$FILE_SIZE"; \
	else \
	  printf 'Warning: Recording file is missing or empty.\n' >&2; \
	  cat "$$SIM_LOG" >&2 || true; \
	fi; \
	rm -f "$$SIM_LOG"; \
	exit $$TEST_STATUS

# --- Combined: both maestro + simctl recordings ---
test-ios-record: test-ios-record-maestro test-ios-record-simulator

test-ios-cf:
	sh tests/ui-testing/run-flow.sh ios-cf

# Media playback tests
test-play-steamboat:
	sh tests/ui-testing/run-flow.sh play-steamboat-willie

test-android-tv:
	sh tests/ui-testing/run-flow.sh tv-simple

test-android-tv-cf:
	sh tests/ui-testing/run-flow.sh tv-cf

# Jellyfin Test Fixture
jellyfin-up:
	$(MAKE) -C tests/fixture/jellyfin up

jellyfin-up-clean:
	$(MAKE) -C tests/fixture/jellyfin up-clean

jellyfin-down:
	$(MAKE) -C tests/fixture/jellyfin down

jellyfin-status:
	$(MAKE) -C tests/fixture/jellyfin status

jellyfin-logs:
	$(MAKE) -C tests/fixture/jellyfin logs

jellyfin-api-test:
	$(MAKE) -C tests/fixture/jellyfin api-test

jellyfin-init:
	$(MAKE) -C tests/fixture/jellyfin init

jellyfin-save-config:
	$(MAKE) -C tests/fixture/jellyfin save-config
