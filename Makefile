MAESTRO_BIN ?= $(HOME)/.maestro/bin
export PATH := $(MAESTRO_BIN):$(PATH)

.DEFAULT_GOAL := help

.PHONY: help e2e e2e-setup ui-test-install-android ui-test-simple ui-test-simple-dev ui-test-cf ui-test-cf-dev ui-test-all

help:
	@printf '%-24s %s\n' 'help' 'Print this target list.'
	@printf '%-24s %s\n' 'e2e' 'Start an Android Maestro device and run the legacy login.yaml flow.'
	@printf '%-24s %s\n' 'e2e-setup' 'Install the Maestro CLI with the upstream installer.'
	@printf '%-24s %s\n' 'ui-test-install-android' 'Prebuild and install the Android release variant for UI testing.'
	@printf '%-24s %s\n' 'ui-test-simple' 'Run the normal SimpleFlow from a cleared app launch.'
	@printf '%-24s %s\n' 'ui-test-simple-dev' 'Run SimpleFlowDev assuming the app is already on the server URL screen.'
	@printf '%-24s %s\n' 'ui-test-cf' 'Run the normal Cloudflare flow from a cleared app launch.'
	@printf '%-24s %s\n' 'ui-test-cf-dev' 'Run the Cloudflare dev flow assuming the app is already on the server URL screen.'
	@printf '%-24s %s\n' 'ui-test-all' 'Run the normal SimpleFlow and Cloudflare flows.'

e2e:
	maestro start-device --platform android
	maestro test login.yaml

e2e-setup:
	curl -fsSL "https://get.maestro.mobile.dev" | bash

ui-test-install-android:
	bun run prebuild
	bun run android:ui-test

ui-test-simple:
	sh tests/ui-testing/run-flow.sh simple

ui-test-simple-dev:
	sh tests/ui-testing/run-flow.sh simple-dev

ui-test-cf:
	sh tests/ui-testing/run-flow.sh cf

ui-test-cf-dev:
	sh tests/ui-testing/run-flow.sh cf-dev

ui-test-all:
	sh tests/ui-testing/run-flow.sh all
