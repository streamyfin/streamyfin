MAESTRO_BIN ?= $(HOME)/.maestro/bin
export PATH := $(MAESTRO_BIN):$(PATH)

ENV_FILE ?= tests/maestro/.env.local
MAESTRO_APP_ID ?= com.fredrikburmester.streamyfin
MAESTRO_ENV_FILE = $(if $(filter /%,$(ENV_FILE)),$(ENV_FILE),$(CURDIR)/$(ENV_FILE))
JELLYFIN_MAKE = $(MAKE) -C tests/fixtures/jellyfin MAESTRO_ENV_FILE="$(MAESTRO_ENV_FILE)" MAESTRO_TARGET="$(MAESTRO_TARGET)"

.DEFAULT_GOAL := help

.PHONY: help \
	e2e e2e-setup install-dependencies \
	ensure-prebuild-phone ensure-prebuild-tv run-android run-android-tv run-ios clean-artifacts \
	install-android install-android-tv install-ios \
	test-login-android test-login-android-tv test-login-ios \
	test-cf-android test-cf-android-tv test-cf-ios test-play-steamboat-android test-play-steamboat-android-tv test-play-steamboat-ios \
	record-simple-maestro-android record-cf-simple-maestro-android \
	record-simple-adb-android record-cf-simple-adb-android \
	record-simple-maestro-ios record-cf-simple-maestro-ios \
	record-simple-simulator-ios record-cf-simple-simulator-ios \
	record-simple-maestro-android-tv record-cf-simple-maestro-android-tv \
	test-android-record test-android-record-maestro test-android-record-adb \
	test-ios-record test-ios-record-maestro test-ios-record-simulator \
	jellyfin-up jellyfin-up-clean jellyfin-reset jellyfin-down jellyfin-status jellyfin-logs jellyfin-api-test jellyfin-save-config jellyfin-configure-urls jellyfin-configure-maestro-ids jellyfin-scan-library jellyfin-download-media jellyfin-clean-media \
	media-list

help:
	@printf '\n%s\n' 'Streamyfin local test harness'
	@printf '%s\n\n' 'Usage: make <target> [ENV_FILE=tests/maestro/.env.local]'
	@printf '%s\n' 'Environment'
	@printf '  %-30s %s\n' 'ENV_FILE' 'Maestro env file used by tests and Jellyfin helpers. Defaults to tests/maestro/.env.local'
	@printf '  %-30s %s\n' 'MAESTRO_BIN' 'Maestro binary directory. Defaults to $$HOME/.maestro/bin'
	@printf '  %-30s %s\n' 'MAESTRO_APP_ID' 'App ID under test. Defaults to com.fredrikburmester.streamyfin'
	@printf '  %-30s %s\n' 'MAESTRO_PLATFORM' 'Maestro test platform: android or ios. Targets set this automatically.'
	@printf '  %-30s %s\n' 'MAESTRO_DEVICE' 'Optional simulator/emulator UDID for Maestro --device.'
	@printf '  %-30s %s\n\n' 'MAESTRO_TARGET' 'Jellyfin URL target: android, ios, or device. Defaults by target.'
	@printf '%s\n' 'Setup'
	@printf '  %-30s %s\n' 'help' 'Show this help screen.'
	@printf '  %-30s %s\n' 'install-dependencies' 'Install project dependencies, reload submodules, and install Maestro.'
	@printf '  %-30s %s\n' 'e2e-setup' 'Install the Maestro CLI only.'
	@printf '  %-30s %s\n' 'ensure-prebuild-phone' 'Prebuild phone native project only when needed.'
	@printf '  %-30s %s\n' 'ensure-prebuild-tv' 'Prebuild Android TV native project only when needed.'
	@printf '  %-30s %s\n' 'clean-artifacts' 'Remove local Maestro screenshots and recordings.'
	@printf '  %-30s %s\n\n' 'media-list' 'List local Jellyfin fixture media files.'
	@printf '%s\n' 'Run Development Builds'
	@printf '  %-30s %s\n' 'run-android' 'Ensure phone prebuild, then run Android.'
	@printf '  %-30s %s\n' 'run-android-tv' 'Ensure TV prebuild, then run Android TV.'
	@printf '  %-30s %s\n\n' 'run-ios' 'Ensure phone prebuild, then run iOS.'
	@printf '%s\n' 'Install UI Test Builds'
	@printf '  %-30s %s\n' 'install-android' 'Ensure phone prebuild, then install Android release.'
	@printf '  %-30s %s\n' 'install-android-tv' 'Ensure TV prebuild, then install Android TV release.'
	@printf '  %-30s %s\n\n' 'install-ios' 'Ensure phone prebuild, then install iOS release.'
	@printf '%s\n' 'Jellyfin Fixture'
	@printf '  %-30s %s\n' 'jellyfin-up' 'Start Jellyfin and publish localhost, emulator, and LAN URLs.'
	@printf '  %-30s %s\n' 'jellyfin-up-clean' 'Start Jellyfin with blank runtime config.'
	@printf '  %-30s %s\n' 'jellyfin-reset' 'Discard runtime config and start blank Jellyfin for manual setup.'
	@printf '  %-30s %s\n' 'jellyfin-clean-media' 'Delete generated fixture media but keep media directories.'
	@printf '  %-30s %s\n' 'jellyfin-download-media' 'Download/transcode public Jellyfin fixture media.'
	@printf '  %-30s %s\n' 'jellyfin-configure-urls' 'Update Maestro env with reachable Jellyfin URL.'
	@printf '  %-30s %s\n' 'jellyfin-configure-maestro-ids' 'Update Maestro env with Jellyfin library and fixture media selectors.'
	@printf '  %-30s %s\n' 'jellyfin-scan-library' 'Trigger a Jellyfin library scan.'
	@printf '  %-30s %s\n' 'jellyfin-api-test' 'Verify API login and library access.'
	@printf '  %-30s %s\n' 'jellyfin-save-config' 'Snapshot current runtime config into base_config.'
	@printf '  %-30s %s\n' 'jellyfin-status' 'Show Docker Compose service status.'
	@printf '  %-30s %s\n' 'jellyfin-logs' 'Follow Jellyfin logs.'
	@printf '  %-30s %s\n\n' 'jellyfin-down' 'Stop and remove Jellyfin container and volumes.'
	@printf '%s\n' 'Maestro UI Tests'
	@printf '  %-30s %s\n' 'test-login-android' 'Run Android phone direct-login flow.'
	@printf '  %-30s %s\n' 'test-login-android-tv' 'Run Android TV direct-login flow.'
	@printf '  %-30s %s\n' 'test-login-ios' 'Run iOS phone direct-login flow.'
	@printf '  %-30s %s\n' 'test-cf-android' 'Run Android phone Cloudflare custom-header flow.'
	@printf '  %-30s %s\n' 'test-cf-android-tv' 'Run Android TV Cloudflare custom-header flow.'
	@printf '  %-30s %s\n' 'test-cf-ios' 'Run iOS phone Cloudflare custom-header flow.'
	@printf '  %-30s %s\n' 'test-play-steamboat-android' 'Play Steamboat Willie from an authenticated Android phone home screen.'
	@printf '  %-30s %s\n' 'test-play-steamboat-android-tv' 'Play Steamboat Willie from an authenticated Android TV home screen.'
	@printf '  %-30s %s\n\n' 'test-play-steamboat-ios' 'Play Steamboat Willie from an authenticated iOS phone home screen.'
	@printf '%s\n' 'Recordings'
	@printf '  %-38s %s\n' 'record-simple-maestro-android' 'Record Android simple login with Maestro.'
	@printf '  %-38s %s\n' 'record-cf-simple-maestro-android' 'Record Android Cloudflare-header login with Maestro.'
	@printf '  %-38s %s\n' 'record-simple-adb-android' 'Record Android simple login with adb screenrecord.'
	@printf '  %-38s %s\n' 'record-cf-simple-adb-android' 'Record Android Cloudflare-header login with adb screenrecord.'
	@printf '  %-38s %s\n' 'record-simple-maestro-ios' 'Record iOS simple login with Maestro.'
	@printf '  %-38s %s\n' 'record-cf-simple-maestro-ios' 'Record iOS Cloudflare-header login with Maestro.'
	@printf '  %-38s %s\n' 'record-simple-simulator-ios' 'Record iOS simple login with simctl.'
	@printf '  %-38s %s\n' 'record-cf-simple-simulator-ios' 'Record iOS Cloudflare-header login with simctl.'
	@printf '  %-38s %s\n' 'record-simple-maestro-android-tv' 'Android TV recording is not implemented.'
	@printf '  %-38s %s\n\n' 'record-cf-simple-maestro-android-tv' 'Android TV Cloudflare recording is not implemented.'
	@printf '%s\n' 'Legacy'
	@printf '  %-30s %s\n\n' 'e2e' 'Start a Maestro Android device and run login.yaml if present.'

e2e:
	maestro start-device --platform android
	maestro test login.yaml

e2e-setup:
	@if [ -x "$(MAESTRO_BIN)/maestro" ]; then \
		printf 'Maestro already installed at %s/maestro\n' "$(MAESTRO_BIN)"; \
	else \
		curl -fsSL "https://get.maestro.mobile.dev" | bash; \
	fi

install-dependencies:
	bun run submodule-reload
	bun install
	$(MAKE) e2e-setup

ensure-prebuild-phone:
	@prebuild_type=$$(sh scripts/detect-prebuild-type.sh); \
	if [ "$$prebuild_type" = "phone" ]; then \
		printf '%s\n' 'Prebuild already matches phone; skipping bun run prebuild.'; \
	else \
		printf 'Current prebuild type: %s; running bun run prebuild.\n' "$$prebuild_type"; \
		bun run prebuild; \
	fi

ensure-prebuild-tv:
	@prebuild_type=$$(sh scripts/detect-prebuild-type.sh android); \
	if [ "$$prebuild_type" = "tv" ]; then \
		printf '%s\n' 'Prebuild already matches TV; skipping bun run prebuild:tv.'; \
	else \
		printf 'Current prebuild type: %s; running bun run prebuild:tv.\n' "$$prebuild_type"; \
		bun run prebuild:tv; \
	fi

run-android: ensure-prebuild-phone
	bun run android

run-android-tv:
	bun run android:tv

run-ios: ensure-prebuild-phone
	bun run ios

clean-artifacts:
	mkdir -p tests/maestro/artifacts
	find tests/maestro/artifacts -mindepth 1 -maxdepth 1 ! -name .gitkeep -exec rm -rf -- {} +

test-login-android test-cf-android test-play-steamboat-android \
record-simple-maestro-android record-cf-simple-maestro-android \
record-simple-adb-android record-cf-simple-adb-android: MAESTRO_TARGET ?= android

test-login-android-tv test-cf-android-tv test-play-steamboat-android-tv \
record-simple-maestro-android-tv record-cf-simple-maestro-android-tv: MAESTRO_TARGET ?= android-tv

test-login-ios test-cf-ios test-play-steamboat-ios \
record-simple-maestro-ios record-cf-simple-maestro-ios \
record-simple-simulator-ios record-cf-simple-simulator-ios: MAESTRO_TARGET ?= ios

jellyfin-up jellyfin-up-clean jellyfin-reset jellyfin-down jellyfin-status jellyfin-logs \
jellyfin-api-test jellyfin-save-config jellyfin-configure-urls jellyfin-configure-maestro-ids \
jellyfin-scan-library jellyfin-download-media jellyfin-clean-media: MAESTRO_TARGET ?= android

install-android: ensure-prebuild-phone
	bun run android:ui-test

install-android-tv:
	bun run android:tv:ui-test

install-ios: ensure-prebuild-phone
	bun run ios:ui-test

test-login-android:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh simple

test-cf-android:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh cf

test-login-ios:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=ios MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh ios-simple

test-cf-ios:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=ios MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh ios-cf

test-login-android-tv:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh tv-simple

test-cf-android-tv:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh tv-cf

test-play-steamboat-android:
	@echo "Updating Maestro Jellyfin fixture selectors..."
	@$(JELLYFIN_MAKE) configure-maestro-ids
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh play-steamboat-willie

test-play-steamboat-android-tv:
	@echo "Updating Maestro Jellyfin fixture selectors..."
	@$(JELLYFIN_MAKE) configure-maestro-ids
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh tv-play-steamboat-willie

test-play-steamboat-ios:
	@echo "Updating Maestro Jellyfin fixture selectors..."
	@$(JELLYFIN_MAKE) configure-maestro-ids
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=ios MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/run-flow.sh ios-play-steamboat-willie

record-simple-maestro-android:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/record-flow.sh simple maestro android

record-cf-simple-maestro-android:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/record-flow.sh cf-simple maestro android

record-simple-adb-android:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/record-flow.sh simple adb android

record-cf-simple-adb-android:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=android MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/record-flow.sh cf-simple adb android

record-simple-maestro-ios:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=ios MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/record-flow.sh simple maestro ios

record-cf-simple-maestro-ios:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=ios MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/record-flow.sh cf-simple maestro ios

record-simple-simulator-ios:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=ios MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/record-flow.sh simple simulator ios

record-cf-simple-simulator-ios:
	MAESTRO_APP_ID="$(MAESTRO_APP_ID)" MAESTRO_PLATFORM=ios MAESTRO_TARGET="$(MAESTRO_TARGET)" ENV_FILE="$(ENV_FILE)" sh tests/maestro/record-flow.sh cf-simple simulator ios

record-simple-maestro-android-tv:
	@printf '%s\n' "Android TV recording isn't implemented."

record-cf-simple-maestro-android-tv:
	@printf '%s\n' "Android TV Cloudflare recording isn't implemented."

test-android-record-maestro: record-simple-maestro-android

test-android-record-adb: record-simple-adb-android

test-android-record: record-simple-maestro-android record-simple-adb-android

test-ios-record-maestro: record-simple-maestro-ios

test-ios-record-simulator: record-simple-simulator-ios

test-ios-record: record-simple-maestro-ios record-simple-simulator-ios

jellyfin-up:
	@echo "Opening Jellyfin fixture from saved base_config..."
	@$(JELLYFIN_MAKE) up

jellyfin-up-clean:
	@echo "Opening blank Jellyfin fixture for manual setup..."
	@$(JELLYFIN_MAKE) up-clean

jellyfin-reset:
	@echo "Resetting Jellyfin fixture runtime state..."
	@$(JELLYFIN_MAKE) reset

jellyfin-down:
	@echo "Stopping Jellyfin fixture..."
	@$(JELLYFIN_MAKE) down

jellyfin-status:
	@echo "Showing Jellyfin fixture container status..."
	@$(JELLYFIN_MAKE) status

jellyfin-logs:
	@echo "Following Jellyfin fixture logs..."
	@$(JELLYFIN_MAKE) logs

jellyfin-configure-urls:
	@echo "Updating Jellyfin test access URL configuration..."
	@$(JELLYFIN_MAKE) configure-urls

jellyfin-configure-maestro-ids:
	@echo "Updating Maestro Jellyfin fixture selectors..."
	@$(JELLYFIN_MAKE) configure-maestro-ids

jellyfin-scan-library:
	@echo "Triggering Jellyfin fixture library scan..."
	@$(JELLYFIN_MAKE) scan-library

jellyfin-download-media:
	@echo "Preparing generated public-domain Jellyfin fixture media..."
	@$(JELLYFIN_MAKE) download-media

jellyfin-clean-media:
	@echo "Removing generated Jellyfin fixture media files..."
	@$(JELLYFIN_MAKE) clean-media

jellyfin-api-test:
	@echo "Running Jellyfin fixture API smoke test..."
	@$(JELLYFIN_MAKE) api-test

jellyfin-save-config:
	@echo "Saving current Jellyfin runtime config as base_config..."
	@$(JELLYFIN_MAKE) save-config

media-list:
	@echo "Generated Jellyfin fixture media files:"
	@find tests/fixtures/jellyfin/media -type f ! -name .gitkeep ! -name ATTRIBUTION.md -exec ls -lh {} +
