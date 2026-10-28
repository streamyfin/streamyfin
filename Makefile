e2e:
	python3 e2e/bench/maestro.py --flow e2e/suites/cast/flows/smoke-launch.yml

e2e-setup:
	curl -fsSL "https://get.maestro.mobile.dev" | bash
