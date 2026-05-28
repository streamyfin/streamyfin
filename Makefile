MAESTRO_BIN ?= $(HOME)/.maestro/bin
export PATH := $(MAESTRO_BIN):$(PATH)

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
