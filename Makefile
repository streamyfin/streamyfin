MAESTRO_BIN ?= $(HOME)/.maestro/bin
export PATH := $(MAESTRO_BIN):$(PATH)

.DEFAULT_GOAL := help

.PHONY: help e2e e2e-setup run-android run-android-tv ui-clean ui-test-install-android ui-test-install-android-tv ui-test-simple ui-test-simple-dev ui-test-cf ui-test-cf-dev ui-test-tv-simple ui-test-tv-simple-dev ui-test-tv-cf ui-test-tv-cf-dev ui-test-all

help:
	@printf '\n%s\n' 'Streamyfin targets'
	@printf '%s\n\n' 'Usage: make <target>'
	@printf '%s\n' 'Setup'
	@printf '  %-28s %s\n' 'help' 'Show this help.'
	@printf '  %-28s %s\n' 'e2e-setup' 'Install the Maestro CLI.'
	@printf '  %-28s %s\n\n' 'ui-clean' 'Remove local UI test screenshots.'
	@printf '%s\n' 'Run development builds'
	@printf '  %-28s %s\n' 'run-android' 'Prebuild and run the Android phone app.'
	@printf '  %-28s %s\n\n' 'run-android-tv' 'Prebuild and run the Android TV app.'
	@printf '%s\n' 'Install UI test builds'
	@printf '  %-28s %s\n' 'ui-test-install-android' 'Install the Android phone release variant.'
	@printf '  %-28s %s\n\n' 'ui-test-install-android-tv' 'Install the Android TV release variant.'
	@printf '%s\n' 'Android phone UI tests'
	@printf '  %-28s %s\n' 'ui-test-simple' 'Run SimpleFlow from a cleared app launch.'
	@printf '  %-28s %s\n' 'ui-test-simple-dev' 'Run SimpleFlow from the server URL screen.'
	@printf '  %-28s %s\n' 'ui-test-cf' 'Run Cloudflare flow from a cleared app launch.'
	@printf '  %-28s %s\n' 'ui-test-cf-dev' 'Run Cloudflare flow from the server URL screen.'
	@printf '  %-28s %s\n\n' 'ui-test-all' 'Run phone SimpleFlow and Cloudflare flows.'
	@printf '%s\n' 'Android TV UI tests'
	@printf '  %-28s %s\n' 'ui-test-tv-simple' 'Run TV SimpleFlow from a cleared app launch.'
	@printf '  %-28s %s\n' 'ui-test-tv-simple-dev' 'Run TV SimpleFlow from Add Server or URL screen.'
	@printf '  %-28s %s\n' 'ui-test-tv-cf' 'Run TV Cloudflare flow from a cleared app launch.'
	@printf '  %-28s %s\n\n' 'ui-test-tv-cf-dev' 'Run TV Cloudflare flow from Add Server or URL screen.'
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

ui-clean:
	find tests/ui-testing/artifacts -mindepth 1 ! -name .gitkeep -exec rm -rf {} +

ui-test-install-android:
	bun run prebuild
	bun run android:ui-test

ui-test-install-android-tv:
	bun run prebuild:tv
	bun run android:tv:ui-test

ui-test-simple:
	sh tests/ui-testing/run-flow.sh simple

ui-test-simple-dev:
	sh tests/ui-testing/run-flow.sh simple-dev

ui-test-cf:
	sh tests/ui-testing/run-flow.sh cf

ui-test-cf-dev:
	sh tests/ui-testing/run-flow.sh cf-dev

ui-test-tv-simple:
	sh tests/ui-testing/run-flow.sh tv-simple

ui-test-tv-simple-dev:
	sh tests/ui-testing/run-flow.sh tv-simple-dev

ui-test-tv-cf:
	sh tests/ui-testing/run-flow.sh tv-cf

ui-test-tv-cf-dev:
	sh tests/ui-testing/run-flow.sh tv-cf-dev

ui-test-all:
	sh tests/ui-testing/run-flow.sh all
