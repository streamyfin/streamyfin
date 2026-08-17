import { describe, expect, mock, test } from "bun:test";

// utils/sentry imports the SDK and app modules with native dependencies;
// only the pure scrubbers are under test here. Bun's mock.module is
// retroactive and process-wide, so each mock covers the full surface the
// module under test touches.
mock.module("@sentry/react-native", () => ({
  init: () => undefined,
  close: () => Promise.resolve(),
  breadcrumbsIntegration: () => ({ name: "Breadcrumbs" }),
}));
mock.module("@/utils/storedSettings", () => ({
  readStoredSettings: () => ({}),
  readStoredPluginSettings: () => ({}),
  SETTINGS_KEY: "settings",
  PLUGIN_SETTINGS_KEY: "STREAMYFIN_PLUGIN_SETTINGS",
}));
mock.module("@/utils/version", () => ({
  getVersionInfo: () => ({
    version: "0.0.0",
    build: "1",
    commit: null,
    branch: null,
    profile: null,
    runNumber: null,
    isDev: true,
    isProduction: false,
    display: "test",
  }),
}));
mock.module("react-native", () => ({
  Platform: { OS: "ios", isTV: false },
}));

const { scrubDeep } = await import("./sentry");

describe("scrubDeep — the privacy boundary for outgoing Sentry data", () => {
  test("server origin is replaced and query strings are stripped", () => {
    expect(
      scrubDeep("https://jellyfin.example.com:8096/Items?api_key=secret"),
    ).toBe("https://[server]/Items");
  });

  test("WebSocket URLs with ApiKey are scrubbed too", () => {
    expect(scrubDeep("wss://10.0.0.5:8096/socket?ApiKey=abc&deviceId=x")).toBe(
      "wss://[server]/socket",
    );
  });

  test("media titles in local file paths are redacted, extension kept", () => {
    expect(
      scrubDeep(
        "Failed to open /var/mobile/Documents/Inception (2010) S01E02.mp4",
      ),
    ).toBe("Failed to open /var/mobile/Documents/[media].mp4");
  });

  test("downloaded subtitle and image filenames are redacted", () => {
    expect(scrubDeep("/Documents/subs/My Show - Pilot.en.srt")).toBe(
      "/Documents/subs/[media].srt",
    );
    expect(scrubDeep("file:///data/user/0/app/files/Poster Name.jpg")).toBe(
      "file:///data/user/0/app/files/[media].jpg",
    );
  });

  test("media basenames inside server URL paths are redacted as well", () => {
    expect(scrubDeep("https://x.example.com/videos/abc-123/stream.mp4")).toBe(
      "https://[server]/videos/abc-123/[media].mp4",
    );
  });

  test("non-media strings pass through untouched", () => {
    expect(scrubDeep("Marking item played/unplayed failed")).toBe(
      "Marking item played/unplayed failed",
    );
    expect(scrubDeep("hwdec=videotoolbox codec=hevc")).toBe(
      "hwdec=videotoolbox codec=hevc",
    );
  });

  test("scrubs every nested string in objects and arrays", () => {
    const event = {
      message: "boot",
      extra: {
        urls: ["http://192.168.1.5:8096?api_key=k"],
        detail: { path: "/Documents/Movie Title.mkv" },
      },
    };
    expect(scrubDeep(event)).toEqual({
      message: "boot",
      extra: {
        urls: ["http://[server]"],
        detail: { path: "/Documents/[media].mkv" },
      },
    });
  });

  test("tolerates circular structures", () => {
    const node: Record<string, unknown> = {
      url: "https://srv.example.com?token=t",
    };
    node.self = node;
    const scrubbed = scrubDeep(node) as Record<string, unknown>;
    expect(scrubbed.url).toBe("https://[server]");
    expect(scrubbed.self).toBe(scrubbed);
  });
});
