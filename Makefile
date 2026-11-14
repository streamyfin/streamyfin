.PHONY: e2e e2e-setup

# Phony, or make finds the e2e/ folder up to date and runs nothing. maestro.py picks the one
# emulator or simulator running, never a phone, since the smoke flow clears the app's data:
# DEVICE=<adb serial or udid> runs it on any other device.
e2e:
	python3 e2e/bench/maestro.py --flow e2e/suites/cast/flows/smoke-launch.yml$(if $(DEVICE), --device "$(DEVICE)")

e2e-setup:
	curl -fsSL "https://get.maestro.mobile.dev" | bash
