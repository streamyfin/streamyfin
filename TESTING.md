# Testing

This project uses repo-native checks for code quality and Maestro for Android phone UI smoke tests.

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

## Android UI Tests

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
make ui-test-install-android
```

Run the flows:

```sh
make ui-test-simple
make ui-test-cf
make ui-test-all
```

Do not use `bun run android` before Maestro UI tests. That installs a development build with Expo Dev Client, which can open the development server launcher instead of Streamyfin's login screen.

Screenshots are written to:

```text
tests/ui-testing/artifacts/<timestamp>-<flow>/
```

Artifacts may contain server URLs, usernames, and Cloudflare header values, so they are ignored by git and should be reviewed before sharing.

## Details

See `tests/ui-testing/ui-test-plan.md` for environment variables, flow behavior, runner details, and current limitations.
