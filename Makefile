MAESTRO_BIN ?= $(HOME)/.maestro/bin
export PATH := $(MAESTRO_BIN):$(PATH)

.DEFAULT_GOAL := help

.PHONY: help e2e e2e-setup run-android run-android-tv run-ios clean-artifacts install-android install-android-tv install-ios test-android test-android-cf test-ios test-ios-cf test-android-tv test-android-tv-cf

help:
	@printf '\n%s\n' 'Streamyfin targets'
	@printf '%s\n\n' 'Usage: make <target>'
	@printf '%s\n' 'Setup'
	@printf '  %-28s %s\n' 'help' 'Show this help.'
	@printf '  %-28s %s\n' 'e2e-setup' 'Install the Maestro CLI.'
	@printf '  %-28s %s\n\n' 'clean-artifacts' 'Remove local UI test screenshots.'
	@printf '%s\n' 'Run development builds'
	@printf '  %-28s %s\n' 'run-android' 'Prebuild and run the Android phone app.'
	@printf '  %-28s %s\n' 'run-android-tv' 'Prebuild and run the Android TV app.'
	@printf '  %-28s %s\n\n' 'run-ios' 'Prebuild and run the iOS phone app.'
	@printf '%s\n' 'Install UI test builds'
	@printf '  %-28s %s\n' 'install-android' 'Install the Android phone release variant.'
	@printf '  %-28s %s\n' 'install-android-tv' 'Install the Android TV release variant.'
	@printf '  %-28s %s\n\n' 'install-ios' 'Install the iOS phone release configuration.'
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

e2e:
	maestro start-device --platform android
	maestro test login.yaml

e2e-setup:
	curl -fsSL "https://get.maestro.mobile.dev" | bash

run-android:
	bun run prebuild
	bun run android

run-android-tv:
	bun run prebuild:tv
	bun run android:tv

run-ios:
	bun run prebuild
	bun run ios

clean-artifacts:
	find tests/ui-testing/artifacts -mindepth 1 ! -name .gitkeep -exec rm -rf {} +

install-android:
	bun run prebuild
	bun run android:ui-test

install-android-tv:
	bun run prebuild:tv
	bun run android:tv:ui-test

install-ios:
	bun run prebuild
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
