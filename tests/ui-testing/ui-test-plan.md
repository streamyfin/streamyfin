# Streamyfin UI Testing Plan

This v1 UI test setup uses Maestro to exercise the Expo/React Native Android phone and Android TV login paths. The flows are written for an Android emulator or device with Streamyfin installed and reachable Jellyfin credentials.

This machine does not need Android tooling to keep the files in the repo. Run the actual flows on an Android-capable machine.

## Files

- `tests/ui-testing/run-flow.sh` loads configuration, validates prerequisites, creates screenshot artifact directories, and runs Maestro.
- `tests/ui-testing/flows/simple-flow.yaml` covers direct Jellyfin server login.
- `tests/ui-testing/flows/simple-flow-dev.yaml` covers the same login steps after the app is already open on the server URL screen.
- `tests/ui-testing/flows/cf-flow.yaml` covers Jellyfin login through Cloudflare Access custom headers.
- `tests/ui-testing/flows/cf-flow-dev.yaml` covers the same Cloudflare login steps after the app is already open on the server URL screen.
- `tests/ui-testing/flows/tv-simple-flow.yaml` covers Android TV direct Jellyfin server login.
- `tests/ui-testing/flows/tv-simple-flow-dev.yaml` covers the same Android TV login steps after the TV app is already open on the `Add Server` landing screen or URL form.
- `tests/ui-testing/flows/tv-cf-flow.yaml` covers Android TV Jellyfin login through Cloudflare Access custom headers.
- `tests/ui-testing/flows/tv-cf-flow-dev.yaml` covers the same Android TV Cloudflare login steps after the TV app is already open on the `Add Server` landing screen or URL form.
- `tests/ui-testing/.env.example` documents placeholder values.
- `tests/ui-testing/.env.local` is optional, ignored, and intended for local secrets.
- `tests/ui-testing/artifacts/` stores local screenshots from each run and is ignored except for `.gitkeep`.

## Configuration

Copy the example file and fill in real values on the Android-capable test machine:

```sh
cp tests/ui-testing/.env.example tests/ui-testing/.env.local
```

The runner loads `tests/ui-testing/.env.local` if present. Existing exported shell variables take precedence over file values, and `.env.local` only fills values that are missing from the environment. The runner never prints secret values.

Required for SimpleFlow:

```sh
MAESTRO_APP_ID=com.fredrikburmester.streamyfin
MAESTRO_SERVER_URL=https://jellyfin.example.com
MAESTRO_USERNAME=test-user
```

Required in addition for CF-Flow:

```sh
MAESTRO_CF_ACCESS_CLIENT_ID=example-client-id
MAESTRO_CF_ACCESS_CLIENT_SECRET=example-client-secret
```

`MAESTRO_APP_ID` defaults to `com.fredrikburmester.streamyfin` in the runner, but it can be overridden for alternate builds.
`MAESTRO_PASSWORD` is optional. If it is unset or set to a blank value such as `MAESTRO_PASSWORD=`, the runner exports it as an empty string and the flows skip filling the password field.

## Commands

Package runners:

```sh
bun run android:ui-test
bun run android:tv:ui-test
bun run ui:test:simple
bun run ui:test:simple:dev
bun run ui:test:cf
bun run ui:test:cf:dev
bun run ui:test:tv:simple
bun run ui:test:tv:simple:dev
bun run ui:test:tv:cf
bun run ui:test:tv:cf:dev
bun run ui:test:all
```

Makefile runners:

```sh
make ui-test-install-android
make ui-test-install-android-tv
make ui-test-simple
make ui-test-simple-dev
make ui-test-cf
make ui-test-cf-dev
make ui-test-tv-simple
make ui-test-tv-simple-dev
make ui-test-tv-cf
make ui-test-tv-cf-dev
make ui-test-all
```

Direct runner:

```sh
sh tests/ui-testing/run-flow.sh simple
sh tests/ui-testing/run-flow.sh simple-dev
sh tests/ui-testing/run-flow.sh cf
sh tests/ui-testing/run-flow.sh cf-dev
sh tests/ui-testing/run-flow.sh tv-simple
sh tests/ui-testing/run-flow.sh tv-simple-dev
sh tests/ui-testing/run-flow.sh tv-cf
sh tests/ui-testing/run-flow.sh tv-cf-dev
sh tests/ui-testing/run-flow.sh all
```

The runner accepts only `simple`, `simple-dev`, `cf`, `cf-dev`, `tv-simple`, `tv-simple-dev`, `tv-cf`, `tv-cf-dev`, or `all`. It fails before running a flow if Maestro is missing or required variables are not set.
The runner and Makefile automatically prepend `$HOME/.maestro/bin` to `PATH` when that directory exists, so the default Maestro installer location works without changing your shell profile.

Before running Maestro, install a release-variant Android phone build with `make ui-test-install-android` or `bun run android:ui-test`. Avoid `bun run android` for UI testing because it installs a development build with Expo Dev Client, which can open the development server launcher instead of Streamyfin's login screen.

For Android TV, start an Android TV emulator and install the release-variant TV build with `make ui-test-install-android-tv` or `bun run android:tv:ui-test`. Use `make ui-test-tv-simple`, `make ui-test-tv-cf`, or the matching `bun run ui:test:tv:*` commands for TV runs. The phone flows are not expected to work against Android TV because the TV login flow starts with an `Add Server` screen and uses TV-specific focus behavior.

## SimpleFlow

SimpleFlow starts from a cleared app state, launches the release-installed Streamyfin app, waits until the server URL screen is visible, then delegates to SimpleFlowDev for the login steps. SimpleFlowDev assumes the app is already open on the server URL screen, enters the Jellyfin server URL, connects, waits for the username/password screen, enters the username and optional password, logs in, and waits for an authenticated home-state signal.

Screenshots:

- `01-launched`
- `02-server-url-entered`
- `03-login-screen`
- `04-credentials-entered`
- `05-home`

## CF-Flow

CF-Flow starts from a cleared app state, launches the release-installed Streamyfin app, waits until the server URL screen is visible, then delegates to CF-FlowDev for the Cloudflare login steps. CF-FlowDev assumes the app is already open on the server URL screen, opens `Advanced (Custom Headers)`, selects `Cloudflare Zero Trust`, captures the empty preset fields, then enters the Jellyfin server URL and Cloudflare Access header values, connects, enters the username and optional password, logs in, and waits for an authenticated home-state signal.

Screenshots:

- `01-launched`
- `02-cloudflare-preset`
- `03-cloudflare-headers-entered`
- `04-login-screen`
- `05-home`

## Android TV Flows

The Android TV flows mirror SimpleFlow and CF-Flow, but they first handle the TV server selection screen by tapping `Add Server`. The TV `*-dev` flows can start from the TV `Add Server` landing screen or from the TV URL form.

TV screenshots use the same checkpoint names as the phone flows:

- `01-launched`
- `02-server-url-entered` or `02-cloudflare-preset`
- `03-login-screen` or `03-cloudflare-headers-entered`
- `04-credentials-entered` or `04-login-screen`
- `05-home`

## Artifacts

Each run creates a timestamped directory under:

```text
tests/ui-testing/artifacts/
```

Examples:

```text
tests/ui-testing/artifacts/2026-05-28_120000-simple/
tests/ui-testing/artifacts/2026-05-28_120000-cf/
tests/ui-testing/artifacts/2026-05-28_120000-tv-simple/
tests/ui-testing/artifacts/2026-05-28_120000-tv-cf/
tests/ui-testing/artifacts/2026-05-28_120000-all/simple/
tests/ui-testing/artifacts/2026-05-28_120000-all/cf/
```

Screenshots may contain server URLs, usernames, and Cloudflare header values. Keep artifacts local unless they have been reviewed and redacted.

## Remote Android Workflow

Push this branch from the development machine:

```sh
git push origin feature/jeeftor-tv-test-with-testing
```

On an Android-capable machine:

```sh
git fetch origin
git switch feature/jeeftor-tv-test-with-testing
bun install --frozen-lockfile
cp tests/ui-testing/.env.example tests/ui-testing/.env.local
# Fill in real values.
make ui-test-install-android
make ui-test-simple
make ui-test-cf
make ui-test-all
```

For Android TV on the same branch:

```sh
make ui-test-install-android-tv
make ui-test-tv-simple
make ui-test-tv-cf
```

The flows can also run without `.env.local`:

```sh
MAESTRO_SERVER_URL=https://example.test \
MAESTRO_USERNAME=test-user \
make ui-test-simple
```

For Cloudflare:

```sh
MAESTRO_SERVER_URL=https://example.test \
MAESTRO_USERNAME=test-user \
MAESTRO_CF_ACCESS_CLIENT_ID=example-client-id \
MAESTRO_CF_ACCESS_CLIENT_SECRET=example-client-secret \
make ui-test-cf
```

Inspect screenshots after each run:

```text
tests/ui-testing/artifacts/<timestamp>-<flow>/
```

## Limitations And Hardening

- v1 targets Android phone and Android TV.
- iOS, tvOS, and CI are future phases.
- Local emulator validation is out of scope on machines without Android tooling.
- The flows use visible text, placeholders, Maestro index selectors, and TV focus/tap behavior. Future hardening should add stable `testID` values to the server URL field, login inputs, buttons, custom header controls, Cloudflare header value fields, and TV server-selection controls.
- First-login intro UI can appear after authentication, so the home assertion accepts `Home`, the intro title, or common home section text as authenticated-state signals.
