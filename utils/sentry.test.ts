import { stubReactNative } from "@/test-utils/reactNative";

// utils/sentry imports the SDK and app modules with native dependencies;
// only the pure scrubbers are under test here, so each mock covers the surface
// the module under test touches.
const initCalls: unknown[] = [];
jest.mock("@sentry/react-native", () => ({
  init: (options: unknown) => {
    initCalls.push(options);
  },
  close: () => Promise.resolve(),
  breadcrumbsIntegration: () => ({ name: "Breadcrumbs" }),
}));
jest.mock("@/utils/storedSettings", () => ({
  readStoredSettings: () => ({}),
  readStoredPluginSettings: () => ({}),
  SETTINGS_KEY: "settings",
  PLUGIN_SETTINGS_KEY: "STREAMYFIN_PLUGIN_SETTINGS",
}));
jest.mock("@/utils/version", () => ({
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
// What the native side says the build is; each case sets what it needs.
const mockBuild: { applicationId: string | null; isDevice: boolean | null } = {
  applicationId: "com.fredrikburmester.streamyfin",
  isDevice: true,
};
jest.mock("expo-application", () => ({
  get applicationId() {
    return mockBuild.applicationId;
  },
}));
jest.mock("expo-device", () => ({
  get isDevice() {
    return mockBuild.isDevice;
  },
}));
stubReactNative();

import { AxiosError } from "axios";
import { OFFICIAL_APPLICATION_IDS } from "@/constants/Sentry";
import { describeHttpResponse, markExpectedError } from "./errors";
import {
  applicationIdKind,
  type BuildIdentity,
  classifyOutgoingEvent,
  initializeSentryIfConsented,
  isUserInteractionBreadcrumb,
  reportsFromBuild,
  scrubDeep,
} from "./sentry";

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

  // A case that does initialize runs in a copy of the module of its own:
  // initializeSentry latches on success, and the copy the other cases share
  // must stay unlatched until the last of them.
  const initializesOn = (OS: "ios" | "android"): unknown[] => {
    const before = initCalls.length;
    jest.isolateModules(() => {
      require("@/test-utils/reactNative").stubReactNative({ OS });
      require("./sentry").initializeSentryIfConsented();
    });
    return initCalls.splice(before);
  };

  const tagsOf = (options: unknown) =>
    (options as { initialScope: { tags: Record<string, string> } }).initialScope
      .tags;

  // Issues were filed under `production` from a tvOS simulator and from forks
  // (com.gauvino.streamyfin), next to the ones from the store.
  test("a release build on a simulator never initializes the SDK", () => {
    setDev(false);
    mockBuild.isDevice = false;
    initializeSentryIfConsented();
    expect(initCalls).toHaveLength(0);
    mockBuild.isDevice = true;
  });

  test("a release build under another identifier never initializes the SDK", () => {
    setDev(false);
    mockBuild.applicationId = "com.gauvino.streamyfin";
    initializeSentryIfConsented();
    expect(initCalls).toHaveLength(0);
    mockBuild.applicationId = "com.fredrikburmester.streamyfin";
  });

  // expo-device guesses on Android, from Build fields that real hardware
  // matches (a Rockchip box ships as "rk30sdk"): a wrong guess must not be
  // what keeps a TV box out. The same answer on iOS is a fact and does.
  test("an Android build taken for an emulator initializes all the same", () => {
    setDev(false);
    mockBuild.isDevice = false;
    expect(initializesOn("ios")).toHaveLength(0);
    expect(initializesOn("android")).toHaveLength(1);
    mockBuild.isDevice = true;
  });

  // The IPAs handed to beta testers are sideloaded, and AltStore and
  // Sideloadly sign them under the official identifier plus the signer's
  // team id.
  test("the official build re-signed for sideloading initializes, and says so", () => {
    setDev(false);
    mockBuild.applicationId = "com.fredrikburmester.streamyfin.ABCDE12345";
    const [options] = initializesOn("ios");
    expect(tagsOf(options)["build.identifier"]).toBe("resigned");
    mockBuild.applicationId = "com.fredrikburmester.streamyfin";
  });

  // Ordering matters: initializeSentry latches on success, so the release
  // case runs last or it would mask the cases above.
  test("the official release build initializes as normal", () => {
    setDev(false);
    initializeSentryIfConsented();
    expect(initCalls).toHaveLength(1);
    expect(tagsOf(initCalls[0])["build.identifier"]).toBe("official");
  });

  // "App Hang Non Fully Blocked" kept arriving from a build that passed
  // `enableReportNonFullyBlockedAppHangs: false`: sentry-cocoa reads the key
  // as "Blocking" and ignores one it does not know.
  test("non fully blocking app hangs are switched off under the key sentry-cocoa reads", () => {
    const options = initCalls[0] as Record<string, unknown>;
    expect(options.enableReportNonFullyBlockingAppHangs).toBe(false);
    expect(options).not.toHaveProperty("enableReportNonFullyBlockedAppHangs");
  });
});

describe("reportsFromBuild — which builds report at all", () => {
  const store: BuildIdentity = {
    isDev: false,
    debugOverride: false,
    applicationId: OFFICIAL_APPLICATION_IDS[0],
    isDevice: true,
    reportsToProject: true,
  };

  test("the store build on a real device reports", () => {
    expect(reportsFromBuild(store)).toBe(true);
  });

  test("a dev build does not", () => {
    expect(reportsFromBuild({ ...store, isDev: true })).toBe(false);
  });

  test("a simulator does not", () => {
    expect(reportsFromBuild({ ...store, isDevice: false })).toBe(false);
  });

  test.each(["com.gauvino.streamyfin", "com.massimotseng.yomifin"])(
    "a fork running as %s does not",
    (applicationId) => {
      expect(reportsFromBuild({ ...store, applicationId })).toBe(false);
    },
  );

  test("the official build re-signed under a signer's team id does", () => {
    expect(
      reportsFromBuild({
        ...store,
        applicationId: "com.fredrikburmester.streamyfin.ABCDE12345",
      }),
    ).toBe(true);
  });

  // EXPO_PUBLIC_SENTRY_DSN: its events never reach this project, so its
  // identifier is its own business.
  test("a fork reporting to a project of its own does", () => {
    expect(
      reportsFromBuild({
        ...store,
        applicationId: "com.gauvino.streamyfin",
        reportsToProject: false,
      }),
    ).toBe(true);
  });

  test("a fork's simulator still does not", () => {
    expect(
      reportsFromBuild({ ...store, isDevice: false, reportsToProject: false }),
    ).toBe(false);
  });

  // A failed native read must not be what switches crash reporting off for
  // the store build.
  test("what cannot be read counts as the official build on a real device", () => {
    expect(
      reportsFromBuild({ ...store, applicationId: null, isDevice: null }),
    ).toBe(true);
  });

  test("the debug switch reports from anything, to test the pipeline", () => {
    expect(
      reportsFromBuild({
        ...store,
        isDev: true,
        isDevice: false,
        applicationId: "com.example.fork",
        debugOverride: true,
      }),
    ).toBe(true);
  });
});

describe("applicationIdKind — whose build an identifier names", () => {
  test("the identifiers the project ships under are official", () => {
    for (const id of OFFICIAL_APPLICATION_IDS) {
      expect(applicationIdKind(id)).toBe("official");
    }
  });

  test("an identifier that cannot be read counts as official", () => {
    expect(applicationIdKind(null)).toBe("official");
  });

  test("an official identifier with a suffix is the build re-signed", () => {
    expect(
      applicationIdKind("com.fredrikburmester.streamyfin.ABCDE12345"),
    ).toBe("resigned");
  });

  // Only a whole extra segment counts: an identifier that merely starts
  // with the same letters is somebody else's app.
  test.each([
    "com.gauvino.streamyfin",
    "com.fredrikburmester.streamyfin2",
    "com.fredrikburmester.streamyfintv",
    "com.fredrikburmester",
    "",
  ])("%p is a fork's", (applicationId) => {
    expect(applicationIdKind(applicationId)).toBe("foreign");
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

  test("a Cloudflare tunnel that is down is dropped", () => {
    expect(
      classifyOutgoingEvent({} as never, {
        originalException: axiosError(530),
      }),
    ).toBeNull();
  });

  test("a gateway's own 403 page is dropped, the server's 403 is not", () => {
    const withContentType = (contentType: string) =>
      new AxiosError(
        "Request failed with status code 403",
        AxiosError.ERR_BAD_RESPONSE,
        { method: "get", url: "https://server/Items", headers: {} as never },
        {},
        {
          status: 403,
          headers: { "content-type": contentType },
          config: {},
        } as never,
      );
    expect(
      classifyOutgoingEvent({} as never, {
        originalException: withContentType("text/html; charset=UTF-8"),
      }),
    ).toBeNull();
    expect(
      classifyOutgoingEvent({ contexts: {} } as never, {
        originalException: withContentType("application/json"),
      }),
    ).not.toBeNull();
  });

  test("a gateway's 403 page is dropped when no content type announces it", () => {
    const withBody = (data: unknown) =>
      new AxiosError(
        "Request failed with status code 403",
        AxiosError.ERR_BAD_RESPONSE,
        { method: "get", url: "https://server/Items", headers: {} as never },
        {},
        { status: 403, headers: {}, data, config: {} } as never,
      );
    expect(
      classifyOutgoingEvent({} as never, {
        originalException: withBody("<html><body>Access denied</body></html>"),
      }),
    ).toBeNull();
    const kept = classifyOutgoingEvent({ contexts: {} } as never, {
      originalException: withBody("Forbidden"),
    });
    // What is kept is the route and the status, not the body it was read from.
    expect(kept?.contexts).toEqual({
      http: { method: "GET", path: "/Items", status: 403 },
    });
  });
});

// REACT-NATIVE-3S: 10 users, a few seconds after launch on Android. The cast
// library's hooks ask a session that is still being resumed for its device
// and media status, with no catch.
describe("classifyOutgoingEvent — the cast library's own unhandled rejection", () => {
  type OutgoingEvent = Parameters<typeof classifyOutgoingEvent>[0];

  // The shape React Native gives a rejected native promise.
  const nativeRejection = (message: string, className: string) =>
    Object.assign(new Error(message), {
      code: "EUNSPECIFIED",
      nativeStackAndroid: [
        { class: className, file: "With.java", methodName: "run" },
        { class: "android.os.Handler", file: "Handler.java" },
      ],
    });

  const eventOf = (
    mechanism: string,
    value: string,
    module?: string,
  ): OutgoingEvent =>
    ({
      exception: {
        values: [
          ...(module
            ? [
                {
                  type: "java.lang.IllegalStateException",
                  value,
                  stacktrace: { frames: [{ module, function: "run" }] },
                },
              ]
            : []),
          { type: "Error", value, mechanism: { type: mechanism } },
        ],
      },
    }) as never;

  const CAST_CLASS = "com.reactnative.googlecast.api.With$3";

  test("is dropped", () => {
    expect(
      classifyOutgoingEvent(eventOf("onunhandledrejection", "No session"), {
        originalException: nativeRejection("No session", CAST_CLASS),
      }),
    ).toBeNull();
  });

  test("is dropped when only the event carries the native frames", () => {
    expect(
      classifyOutgoingEvent(
        eventOf("onunhandledrejection", "No session", CAST_CLASS),
        { originalException: new Error("No session") },
      ),
    ).toBeNull();
  });

  // loadMedia or stop failing in the app's own code is a failed user action,
  // caught and reported at the call site.
  test("the same error caught by a call site of the app is kept", () => {
    const event = eventOf("generic", "No session");
    expect(
      classifyOutgoingEvent(event, {
        originalException: nativeRejection("No session", CAST_CLASS),
      }),
    ).toBe(event);
  });

  test("another unhandled rejection out of the cast library is kept", () => {
    const event = eventOf("onunhandledrejection", "Invalid request");
    expect(
      classifyOutgoingEvent(event, {
        originalException: nativeRejection("Invalid request", CAST_CLASS),
      }),
    ).toBe(event);
  });

  test("a 'No session' from anywhere else is kept", () => {
    const event = eventOf("onunhandledrejection", "No session");
    expect(
      classifyOutgoingEvent(event, {
        originalException: nativeRejection(
          "No session",
          "com.example.other.Player",
        ),
      }),
    ).toBe(event);
    const plain = eventOf("onunhandledrejection", "No session");
    expect(
      classifyOutgoingEvent(plain, {
        originalException: new Error("No session"),
      }),
    ).toBe(plain);
  });
});

// What the socket and download classifiers attach is built from a fixed
// vocabulary, and must mean the same on either side of the boundary.
describe("scrubDeep — the causes the classifiers attach pass unchanged", () => {
  test.each([
    "handshake-http-404",
    "close-1011",
    "tls",
    "HTTP error: 500",
    "Read error: ssl=0x[addr]: Failure in SSL library",
  ])("%s", (cause) => {
    expect(scrubDeep(cause)).toBe(cause);
  });
});

// describeHttpResponse (utils/errors.ts) puts part of a server's answer on an
// event as context, and this is all that stands behind it. What it cannot
// catch is pinned here on purpose: a case that starts failing because the
// scrubber learned to catch it is good news, and only needs moving up.
describe("scrubDeep — what it makes of a piece of a response body", () => {
  test("a URL with a scheme and a bare IPv4 address are caught", () => {
    expect(
      scrubDeep("upstream https://my-private-host.duckdns.org:8920/ timed out"),
    ).toBe("upstream https://[server]/ timed out");
    expect(scrubDeep("no route to 192.168.1.5:8096")).toBe("no route to [ip]");
  });

  // Nothing tells a host name from any other word once the scheme is gone.
  test.each([
    "<title>my-private-host.duckdns.org | 502: Bad gateway</title>",
    "Error occurred while trying to proxy: my-private-host.duckdns.org/Sessions",
    '{"zone":"my-private-host.duckdns.org"}',
    "no healthy upstream for jellyfin.lan:8096",
    "connect to [2001:db8::5]:8096 failed",
  ])("a host without a scheme is not: %s", (text) => {
    expect(scrubDeep(text)).toBe(text);
  });

  const HOST = "my-private-host.duckdns.org";
  const reaches = (contentType: string, data: unknown) =>
    JSON.stringify(
      scrubDeep({
        details: describeHttpResponse(
          new AxiosError(
            "Request failed with status code 500",
            AxiosError.ERR_BAD_RESPONSE,
            undefined,
            {},
            {
              status: 500,
              headers: { "content-type": contentType },
              data,
            } as never,
          ),
        ),
      }),
    );

  // So the page has to be gone before it gets here, whatever it was sent as.
  test("a proxy's page sent as text/plain leaves no host on the event", () => {
    const page = `<!DOCTYPE html><html><head><title>${HOST} | 500</title>`;
    expect(reaches("text/plain", page)).toBe(
      `{"details":{"status":500,"contentType":"text/plain","bodyKind":"html","bodyLength":${page.length}}}`,
    );
  });

  // And so has anything else that was not written to be reported: the same
  // texts the scrubber let through above, as a server would send them.
  test.each([
    ["text/plain", `Error occurred while trying to proxy: ${HOST}/Sessions`],
    ["text/plain", `<title>${HOST} | 502: Bad gateway</title>`],
    ["text/plain", "no healthy upstream for jellyfin.lan:8096"],
    ["text/plain", "connect to [2001:db8::5]:8096 failed"],
    ["application/json", { zone: HOST, detail: `no route to ${HOST}` }],
    ["application/json", { [HOST]: "unreachable" }],
  ])("a %s body leaves no host on the event: %j", (contentType, data) => {
    expect(reaches(contentType, data)).not.toMatch(
      /duckdns|jellyfin\.lan|2001:db8/,
    );
  });

  test("the reason Jellyfin gives in fixed words still arrives", () => {
    expect(reaches("text/plain", "Error processing request.")).toBe(
      '{"details":{"status":500,"contentType":"text/plain","bodyKind":"text","bodyLength":25,"body":"Error processing request."}}',
    );
  });
});
