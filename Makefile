.PHONY: e2e e2e-setup

# Phony, or make finds the e2e/ folder up to date and runs nothing. adb get-state fails as soon as
# two devices are attached, so the guard asks for at least one device in the "device" state.
e2e:
	@adb devices | awk 'NR > 1 && $$2 == "device" { found = 1 } END { exit !found }' || (echo "e2e: start an emulator or connect a device first (adb devices)" && exit 1)
	python3 e2e/bench/maestro.py --flow e2e/suites/cast/flows/smoke-launch.yml

e2e-setup:
	curl -fsSL "https://get.maestro.mobile.dev" | bash
