e2e:
	@adb get-state >/dev/null 2>&1 || (echo "e2e: start an emulator or connect a device first (adb devices)" && exit 1)
	python3 e2e/bench/maestro.py --flow e2e/suites/cast/flows/smoke-launch.yml

e2e-setup:
	curl -fsSL "https://get.maestro.mobile.dev" | bash
