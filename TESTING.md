# Testing

This project uses repo-native checks for code quality and Maestro for Android phone, iOS phone, and Android TV UI smoke tests.

## Static Checks

Run the standard project checks before submitting changes:

```sh
bun run typecheck
bun run check
bun run doctor
```

`bun run test` runs the broader local check suite:

```sh
bun run test
```

That command includes formatting and lint write steps, so review the resulting diff before committing.

## Maestro UI Tests

The Maestro tests live under `tests/ui-testing/`. They cover first-login smoke tests for direct Jellyfin server login and Cloudflare Access custom-header login across Android phone, iOS phone, and Android TV.

This test harness was added to support the custom auth-header work in the stacked PR branch. It verifies that protected Jellyfin servers can be configured from the login screens and that the direct-login path still works while those header controls exist.

The runner files are:

- `tests/ui-testing/run-flow.sh`: loads config, validates prerequisites, creates screenshot artifact directories, and runs Maestro.
- `tests/ui-testing/flows/simple-flow.yaml`: Android/iOS phone direct-login flow from a cleared app launch.
- `tests/ui-testing/flows/cf-flow.yaml`: Android/iOS phone Cloudflare flow from a cleared app launch.
- `tests/ui-testing/flows/tv-simple-flow.yaml`: Android TV direct-login flow from a cleared app launch.
- `tests/ui-testing/flows/tv-cf-flow.yaml`: Android TV Cloudflare flow from a cleared app launch.
- `tests/ui-testing/.env.example`: placeholder-only environment template.
- `tests/ui-testing/.env.local`: optional ignored local secrets file.
- `tests/ui-testing/artifacts/`: ignored screenshot output, except for `.gitkeep`.

Install Maestro if needed:

```sh
curl -fsSL https://get.maestro.mobile.dev | bash
```

The Makefile and UI test runner automatically include `$HOME/.maestro/bin` in `PATH`.

## Configuration

Copy the example file and fill in real values on the test machine:

```sh
cp tests/ui-testing/.env.example tests/ui-testing/.env.local
```

The runner loads `tests/ui-testing/.env.local` if present. Existing exported shell variables take precedence over file values, and `.env.local` only fills values that are missing from the environment. The runner never prints secret values.

Required for direct-login flows:

```sh
MAESTRO_APP_ID=com.fredrikburmester.streamyfin
MAESTRO_SERVER_URL=https://jellyfin.example.com
MAESTRO_USERNAME=test-user
```

Required in addition for Cloudflare flows:

```sh
MAESTRO_CF_ACCESS_CLIENT_ID=example-client-id
MAESTRO_CF_ACCESS_CLIENT_SECRET=example-client-secret
```

`MAESTRO_APP_ID` defaults to `com.fredrikburmester.streamyfin` in the runner, but it can be overridden for alternate builds.

`MAESTRO_PASSWORD` is optional. If it is unset or set to a blank value, the runner exports it as an empty string and the flows skip filling the password field:

```sh
MAESTRO_PASSWORD=
```

The flows can also run without `.env.local`:

```sh
MAESTRO_SERVER_URL=https://example.test \
MAESTRO_USERNAME=test-user \
make test-android
```

For Cloudflare:

```sh
MAESTRO_SERVER_URL=https://example.test \
MAESTRO_USERNAME=test-user \
MAESTRO_CF_ACCESS_CLIENT_ID=example-client-id \
MAESTRO_CF_ACCESS_CLIENT_SECRET=example-client-secret \
make test-android-cf
```

## Make Targets

`make help` is the default Make target and prints grouped command help.

Install release/test builds:

```sh
make install-android
make install-android-tv
make install-ios
```

Run Android phone UI tests:

```sh
make test-android
make test-android-cf
```

Run iOS phone UI tests:

```sh
make test-ios
make test-ios-cf
```

Run Android TV UI tests:

```sh
make test-android-tv
make test-android-tv-cf
```

Clean local screenshot artifacts:

```sh
make clean-artifacts
```

## Package Scripts

Package scripts are wired for the same UI test flows:

```sh
bun run android:ui-test
bun run android:tv:ui-test
bun run ios:ui-test
bun run ui:test:simple
bun run ui:test:cf
bun run ui:test:ios:simple
bun run ui:test:ios:cf
bun run ui:test:tv:simple
bun run ui:test:tv:cf
```

## Direct Runner

The runner accepts these flow names:

```sh
sh tests/ui-testing/run-flow.sh simple
sh tests/ui-testing/run-flow.sh cf
sh tests/ui-testing/run-flow.sh ios-simple
sh tests/ui-testing/run-flow.sh ios-cf
sh tests/ui-testing/run-flow.sh tv-simple
sh tests/ui-testing/run-flow.sh tv-cf
```

The runner fails before executing a flow if Maestro is missing or required variables are not set.

## Android Phone

Start an Android phone emulator, then install the release-variant phone app:

```sh
make install-android
```

Run the flows:

```sh
make test-android
make test-android-cf
```

Do not use `bun run android` before Maestro UI tests. That installs a development build with Expo Dev Client, which can open the development server launcher instead of Streamyfin's login screen.

## Android TV

Android TV uses different login screens, so it has separate Maestro flows and targets. Start an Android TV emulator, then install the release-variant TV app:

```sh
make install-android-tv
```

Run the TV flows:

```sh
make test-android-tv
make test-android-tv-cf
```

The phone flows are not expected to work against Android TV because the TV login flow starts with an `Add Server` screen and uses TV-specific focus behavior.

## iOS Phone

iOS phone uses the same visible login flow as Android phone. The iOS targets reuse the phone Maestro flow files and write iOS-specific artifact directories.

Start an iOS simulator, then install the release-configuration phone app:

```sh
make install-ios
```

Run the iOS flows:

```sh
make test-ios
make test-ios-cf
```

## Flow Coverage

Direct-login flows:

1. Clear app state.
2. Launch the app.
3. Capture `01-launched`.
4. Enter the Jellyfin server URL.
5. Capture `02-server-url-entered`.
6. Connect.
7. Wait for the username/password screen.
8. Capture `03-login-screen`.
9. Enter username and optional password.
10. Capture `04-credentials-entered`.
11. Log in.
12. Wait for an authenticated home-state signal.
13. Capture `05-home`.

Cloudflare flows:

1. Clear app state.
2. Launch the app.
3. Capture `01-launched`.
4. Open `Advanced (Custom Headers)`.
5. Choose `Cloudflare Zero Trust`.
6. Capture `02-cloudflare-preset` before secrets are entered.
7. Enter the server URL and Cloudflare header values.
8. Capture `03-cloudflare-headers-entered`.
9. Connect.
10. Wait for the username/password screen.
11. Capture `04-login-screen`.
12. Enter username and optional password.
13. Log in.
14. Wait for an authenticated home-state signal.
15. Capture `05-home`.

Android TV flows use the same screenshot checkpoint names where possible, but first handle the TV server-selection screen by selecting `Add Server`.

## Artifacts

Each run creates a timestamped directory under:

```text
tests/ui-testing/artifacts/
```

Examples:

```text
tests/ui-testing/artifacts/2026-05-28_120000-simple/
tests/ui-testing/artifacts/2026-05-28_120000-cf/
tests/ui-testing/artifacts/2026-05-28_120000-ios-simple/
tests/ui-testing/artifacts/2026-05-28_120000-ios-cf/
tests/ui-testing/artifacts/2026-05-28_120000-tv-simple/
tests/ui-testing/artifacts/2026-05-28_120000-tv-cf/
```

Screenshots may contain server URLs, usernames, and Cloudflare header values. Keep artifacts local unless they have been reviewed and redacted.

## Remote Workflow

On a machine with Android or iOS tooling:

```sh
git fetch origin
git switch feature/jeeftor-tv-test-with-testing
bun install --frozen-lockfile
cp tests/ui-testing/.env.example tests/ui-testing/.env.local
# Fill in real values.
```

For Android phone:

```sh
make install-android
make test-android
make test-android-cf
```

For Android TV:

```sh
make install-android-tv
make test-android-tv
make test-android-tv-cf
```

For iOS phone:

```sh
make install-ios
make test-ios
make test-ios-cf
```

Inspect screenshots after each run:

```text
tests/ui-testing/artifacts/<timestamp>-<flow>/
```

## Limitations And Hardening

- v1 targets Android phone, iOS phone, and Android TV.
- tvOS and CI are future phases.
- Local emulator/simulator validation is out of scope on machines without Android or iOS tooling.
- The flows use visible text, placeholders, Maestro index selectors, and TV focus/tap behavior. Future hardening should add stable `testID` values to the server URL field, login inputs, buttons, custom header controls, Cloudflare header value fields, and TV server-selection controls.
- First-login intro UI can appear after authentication, so the home assertion accepts `Home`, the intro title, or common home section text as authenticated-state signals.
