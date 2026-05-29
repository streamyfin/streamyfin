MAESTRO_BIN ?= $(HOME)/.maestro/bin
export PATH := $(MAESTRO_BIN):$(PATH)

.DEFAULT_GOAL := help

.PHONY: help e2e e2e-setup ensure-prebuild-phone ensure-prebuild-tv run-android run-android-tv run-ios clean-artifacts install-android install-android-tv install-ios test-android test-android-cf test-ios test-ios-cf test-android-tv test-android-tv-cf jellyfin-setup jellyfin-save-config jellyfin-up jellyfin-down jellyfin-reset jellyfin-status jellyfin-logs jellyfin-api-test

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
	@printf '  %-28s %s\n\n' 'test-android-cf' 'Run Cloudflare flow from a cleared app launch.'
	@printf '%s\n' 'iOS phone UI tests'
	@printf '  %-28s %s\n' 'test-ios' 'Run iOS SimpleFlow from a cleared app launch.'
	@printf '  %-28s %s\n\n' 'test-ios-cf' 'Run iOS Cloudflare flow from a cleared app launch.'
	@printf '%s\n' 'Android TV UI tests'
	@printf '  %-28s %s\n' 'test-android-tv' 'Run TV SimpleFlow from a cleared app launch.'
	@printf '  %-28s %s\n\n' 'test-android-tv-cf' 'Run TV Cloudflare flow from a cleared app launch.'
	@printf '%s\n' 'Legacy'
	@printf '  %-28s %s\n\n' 'e2e' 'Start Maestro Android device and run login.yaml.'
	@printf '%s\n' 'Jellyfin Test Fixture'
	@printf '  %-28s %s\n' 'jellyfin-setup' 'Start blank Jellyfin for manual setup'
	@printf '  %-28s %s\n' 'jellyfin-save-config' 'Save current config as static snapshot'
	@printf '  %-28s %s\n' 'jellyfin-up' 'Start Jellyfin test container'
	@printf '  %-28s %s\n' 'jellyfin-down' 'Stop Jellyfin container'
	@printf '  %-28s %s\n' 'jellyfin-reset' 'Reset Jellyfin to clean state'
	@printf '  %-28s %s\n' 'jellyfin-status' 'Check Jellyfin status'
	@printf '  %-28s %s\n' 'jellyfin-logs' 'Show Jellyfin logs'
	@printf '  %-28s %s\n\n' 'jellyfin-api-test' 'Test Jellyfin API connectivity'

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

test-ios:
	sh tests/ui-testing/run-flow.sh ios-simple

test-ios-cf:
	sh tests/ui-testing/run-flow.sh ios-cf

test-android-tv:
	sh tests/ui-testing/run-flow.sh tv-simple

test-android-tv-cf:
	sh tests/ui-testing/run-flow.sh tv-cf

# Jellyfin Test Fixture
jellyfin-setup:
	$(MAKE) -C tests/fixture/jellyfin setup

jellyfin-save-config:
	$(MAKE) -C tests/fixture/jellyfin save-config

jellyfin-up:
	$(MAKE) -C tests/fixture/jellyfin up

jellyfin-down:
	$(MAKE) -C tests/fixture/jellyfin down

jellyfin-reset:
	$(MAKE) -C tests/fixture/jellyfin reset

jellyfin-status:
	$(MAKE) -C tests/fixture/jellyfin status

jellyfin-logs:
	$(MAKE) -C tests/fixture/jellyfin logs

jellyfin-api-test:
	$(MAKE) -C tests/fixture/jellyfin api-test
