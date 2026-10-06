import { registerRootComponent } from "expo";
import { createElement } from "react";

function SyncPlayTestClientDisabled() {
  return createElement(
    "main",
    { style: { padding: 32, fontFamily: "system-ui", maxWidth: 640 } },
    createElement("h1", null, "Streamyfin SyncPlay"),
    createElement(
      "p",
      null,
      "Use Streamyfin on iOS, Android or TV with Jellyfin's built-in web client.",
    ),
    createElement(
      "p",
      null,
      "The local browser decoder test client is disabled.",
    ),
    createElement(
      "p",
      null,
      "Developers: run bun run syncplay:test:web to enable the local test client.",
    ),
  );
}

// Expo inlines EXPO_PUBLIC flags; release builds always exclude the test client.
const App =
  __DEV__ && process.env.EXPO_PUBLIC_SYNCPLAY_TEST_CLIENT === "1"
    ? require("@/e2e/syncplay/web/WebPreview").WebPreview
    : SyncPlayTestClientDisabled;

registerRootComponent(App);
