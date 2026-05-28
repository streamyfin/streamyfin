MAESTRO_BIN ?= $(HOME)/.maestro/bin
export PATH := $(MAESTRO_BIN):$(PATH)

.DEFAULT_GOAL := help

.PHONY: help e2e e2e-setup run-android run-android-tv ui-clean ui-test-install-android ui-test-install-android-tv ui-test-simple ui-test-simple-dev ui-test-cf ui-test-cf-dev ui-test-tv-simple ui-test-tv-simple-dev ui-test-tv-cf ui-test-tv-cf-dev ui-test-all

help:
	@printf '%-30s %s\n' 'help' 'Print this target list.'
	@printf '%-30s %s\n' 'e2e' 'Start an Android Maestro device and run the legacy login.yaml flow.'
	@printf '%-30s %s\n' 'e2e-setup' 'Install the Maestro CLI with the upstream installer.'
	@printf '%-30s %s\n' 'run-android' 'Prebuild and run the Android phone development build.'
	@printf '%-30s %s\n' 'run-android-tv' 'Prebuild and run the Android TV development build.'
	@printf '%-30s %s\n' 'ui-clean' 'Remove UI test screenshot artifacts while preserving .gitkeep.'
	@printf '%-30s %s\n' 'ui-test-install-android' 'Prebuild and install the Android release variant for UI testing.'
	@printf '%-30s %s\n' 'ui-test-install-android-tv' 'Prebuild and install the Android TV release variant for UI testing.'
	@printf '%-30s %s\n' 'ui-test-simple' 'Run the normal SimpleFlow from a cleared app launch.'
	@printf '%-30s %s\n' 'ui-test-simple-dev' 'Run SimpleFlowDev assuming the app is already on the server URL screen.'
	@printf '%-30s %s\n' 'ui-test-cf' 'Run the normal Cloudflare flow from a cleared app launch.'
	@printf '%-30s %s\n' 'ui-test-cf-dev' 'Run the Cloudflare dev flow assuming the app is already on the server URL screen.'
	@printf '%-30s %s\n' 'ui-test-tv-simple' 'Run the Android TV SimpleFlow from a cleared app launch.'
	@printf '%-30s %s\n' 'ui-test-tv-simple-dev' 'Run the Android TV SimpleFlowDev from the add-server screen.'
	@printf '%-30s %s\n' 'ui-test-tv-cf' 'Run the Android TV Cloudflare flow from a cleared app launch.'
	@printf '%-30s %s\n' 'ui-test-tv-cf-dev' 'Run the Android TV Cloudflare dev flow from the add-server screen.'
	@printf '%-30s %s\n' 'ui-test-all' 'Run the normal SimpleFlow and Cloudflare flows.'

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
