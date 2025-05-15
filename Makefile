e2e:
	maestro start-device --platform android
	maestro test login.yaml

e2e-setup:
curl -fsSL "https://get.maestro.mobile.dev" | bash
