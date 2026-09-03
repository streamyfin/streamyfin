import { describe, expect, mock, test } from "bun:test";
import { stubReactNative } from "@/test-utils/reactNative";

// utils/sentry imports the SDK and app modules with native dependencies;
// only the pure scrubbers are under test here. Bun's mock.module is
// retroactive and process-wide, so each mock covers the full surface the
// module under test touches.
const initCalls: unknown[] = [];
mock.module("@sentry/react-native", () => ({
  init: (options: unknown) => {
    initCalls.push(options);
  },
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
stubReactNative();

const {
  scrubDeep,
  isUserInteractionBreadcrumb,
  initializeSentryIfConsented,
  classifyOutgoingEvent,
} = await import("./sentry");
const { AxiosError } = await import("axios");
const { markExpectedError } = await import("./errors");

describe("isUserInteractionBreadcrumb — no behaviour tracking, no titles", () => {
  test("drops touch breadcrumbs, whose labels are media titles", () => {
    // Shape taken from a real event: the label is a media card's
    // accessibility label, i.e. the title of what the user was browsing.
    expect(
      isUserInteractionBreadcrumb({
        type: "user",
        category: "touch",
        message: "Touch event within element: Map 1213",
        data: { path: [{ label: "Map 1213", name: "Text" }] },
      }),
    ).toBe(true);
  });

  test("drops ui.* interaction breadcrumbs", () => {
    expect(
      isUserInteractionBreadcrumb({
        category: "ui.multiClick",
        message: "HeroCarousel",
      }),
    ).toBe(true);
    expect(isUserInteractionBreadcrumb({ category: "ui.lifecycle" })).toBe(
      true,
    );
  });

  test("keeps app logs and http breadcrumbs", () => {
    expect(
      isUserInteractionBreadcrumb({
        category: "app.log",
        message: "Download failed",
      }),
    ).toBe(false);
    expect(
      isUserInteractionBreadcrumb({
        type: "http",
        category: "xhr",
        data: { url: "https://[server]/Sessions" },
      }),
    ).toBe(false);
  });
});

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

  test("titles with apostrophes are redacted too", () => {
    expect(scrubDeep("/var/mobile/Documents/Don't Look Up (2021).mp4")).toBe(
      "/var/mobile/Documents/[media].mp4",
    );
  });

  test("credential params are redacted even in server-relative URLs", () => {
    expect(
      scrubDeep("/videos/xyz/master.m3u8?DeviceId=abc&api_key=SECRET"),
    ).toBe("/videos/xyz/[media].m3u8?DeviceId=[redacted]&api_key=[redacted]");
  });

  test("credential params survive an unencoded space breaking the URL regex", () => {
    expect(
      scrubDeep("https://host.example.com/My Show S01E02.mp4?ApiKey=SECRET"),
    ).toBe("https://[server]/[media].mp4?ApiKey=[redacted]");
  });

  test("identifying query params are redacted in relative URLs", () => {
    expect(scrubDeep("/Items/Latest?userId=5403820992&limit=8")).toBe(
      "/Items/Latest?userId=[redacted]&limit=8",
    );
  });

  test("scheme-less hosts in native error strings are redacted", () => {
    expect(
      scrubDeep("Failed to connect to jellyfin.local/192.168.1.5:8096"),
    ).toBe("Failed to connect to [server]");
    expect(scrubDeep("Connection refused by 192.168.1.5:8096")).toBe(
      "Connection refused by [ip]",
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

// The project's first 22 events were all local dev noise — test errors and
// stack frames naming a developer's home directory — so a dev build must not
// reach the SDK at all, not merely tag itself as "development".
describe("dev builds do not report", () => {
  const setDev = (value: boolean) => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = value;
  };

  test("a dev build never initializes the SDK", () => {
    setDev(true);
    initializeSentryIfConsented();
    expect(initCalls).toHaveLength(0);
  });

  // Ordering matters: initializeSentry latches on success, so the release
  // case runs last or it would mask the dev case above.
  test("a release build initializes as normal", () => {
    setDev(false);
    initializeSentryIfConsented();
    expect(initCalls).toHaveLength(1);
  });
});

describe("classifyOutgoingEvent — axios errors on the unhandledrejection path", () => {
  const axiosError = (status?: number) =>
    new AxiosError(
      status ? `Request failed with status code ${status}` : "Network Error",
      status ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_NETWORK,
      { method: "get", url: "https://server/Items/abc", headers: {} as never },
      {},
      status ? ({ status, headers: {}, config: {} } as never) : undefined,
    );

  test("connectivity failures are dropped", () => {
    expect(
      classifyOutgoingEvent({} as never, { originalException: axiosError() }),
    ).toBeNull();
    expect(
      classifyOutgoingEvent({} as never, {
        originalException: axiosError(502),
      }),
    ).toBeNull();
  });

  test("expected errors are dropped", () => {
    expect(
      classifyOutgoingEvent({} as never, {
        originalException: markExpectedError(axiosError(400)),
      }),
    ).toBeNull();
  });

  test("a real HTTP failure gets the route+status fingerprint", () => {
    const event = { contexts: {} } as never as Parameters<
      typeof classifyOutgoingEvent
    >[0];
    const out = classifyOutgoingEvent(event, {
      originalException: axiosError(400),
    });
    expect(out?.fingerprint).toEqual([
      "unhandled-http",
      "GET",
      "/Items/abc",
      "400",
    ]);
    expect(out?.contexts?.http).toEqual({
      method: "GET",
      path: "/Items/abc",
      status: 400,
    });
  });

  test("a fingerprint set by an explicit capture path is not overwritten", () => {
    const event = { fingerprint: ["data-layer"] } as never as Parameters<
      typeof classifyOutgoingEvent
    >[0];
    const out = classifyOutgoingEvent(event, {
      originalException: axiosError(400),
    });
    expect(out?.fingerprint).toEqual(["data-layer"]);
  });

  test("non-axios exceptions pass through untouched", () => {
    const event = {} as never as Parameters<typeof classifyOutgoingEvent>[0];
    expect(
      classifyOutgoingEvent(event, { originalException: new Error("x") }),
    ).toBe(event);
    expect(classifyOutgoingEvent(event, undefined)).toBe(event);
  });
});
