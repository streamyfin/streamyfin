# Browser decoder test client

This developer harness exercises Streamyfin's SyncPlay controller with an HTML video decoder. It is not a shipped Streamyfin web application. Product acceptance uses the native app and Jellyfin's built-in web SyncPlay client.

Start the disposable Jellyfin server using the [local test instructions](../README.md), then run:

```sh
bun run syncplay:test:web
```

Open <http://localhost:8083/>. The launcher sets `EXPO_TV=0` and `EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT=1`. Expo must start with that environment flag; changing it requires restarting Metro. The test client also requires a development build (`__DEV__`). Default web starts and release builds show only a disabled-test-client page.

The client shares the production controller and transport, supports the local H.264/AAC fixtures, and keeps authentication tokens in memory. `react-dom` and `react-native-web` are development dependencies for this harness.

Run its lifecycle and entry-guard regressions:

```sh
bun run test:unit --runInBand --watchman=false e2e/syncplay/web
```
