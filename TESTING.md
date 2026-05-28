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

## Android Phone UI Tests

The Android phone UI smoke tests live under `tests/ui-testing/` and use Maestro.

Install Maestro if needed:

```sh
curl -fsSL https://get.maestro.mobile.dev | bash
```

The Makefile and UI test runner automatically include `$HOME/.maestro/bin` in `PATH`.

Configure local test credentials:

```sh
cp tests/ui-testing/.env.example tests/ui-testing/.env.local
# Fill in real values.
```

`MAESTRO_PASSWORD` may be blank:

```sh
MAESTRO_PASSWORD=
```

Start an Android emulator, then install the release-variant phone app:

```sh
make install-android
```

Run the flows:

```sh
make test-android
make test-android-cf
make test-android-cf-dev
```

Do not use `bun run android` before Maestro UI tests. That installs a development build with Expo Dev Client, which can open the development server launcher instead of Streamyfin's login screen.

## Android TV UI Tests

Android TV uses different login screens, so it has separate Maestro flows and targets.

Start an Android TV emulator, then install the release-variant TV app:

```sh
make install-android-tv
```

Run the TV flows:

```sh
make test-android-tv
make test-android-tv-cf
make test-android-tv-cf-dev
```

The package scripts are also wired:

```sh
bun run android:tv:ui-test
bun run ui:test:tv:simple
bun run ui:test:tv:cf
bun run ui:test:tv:cf:dev
```

Use the `*-dev` TV flows only when the TV app is already open on the `Add Server` landing screen or the Jellyfin URL form.

## iOS Phone UI Tests

iOS phone uses the same visible login flow as Android phone. The iOS targets reuse the phone Maestro flow files and write iOS-specific artifact directories.

Start an iOS simulator, then install the release-configuration phone app:

```sh
make install-ios
```

Run the iOS flows:

```sh
make test-ios
make test-ios-cf
make test-ios-cf-dev
```

The package scripts are also wired:

```sh
bun run ios:ui-test
bun run ui:test:ios:simple
bun run ui:test:ios:cf
bun run ui:test:ios:cf:dev
```

Use the `*-dev` iOS flows only when the iOS app is already open on the Jellyfin URL form.

Screenshots are written to:

```text
tests/ui-testing/artifacts/<timestamp>-<flow>/
```

Artifacts may contain server URLs, usernames, and Cloudflare header values, so they are ignored by git and should be reviewed before sharing.

## Details

See `tests/ui-testing/ui-test-plan.md` for environment variables, flow behavior, runner details, and current limitations.
