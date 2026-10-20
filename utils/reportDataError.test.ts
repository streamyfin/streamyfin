type Captured = {
  exception: unknown;
  fingerprint?: string[];
  contexts: Record<string, unknown>;
};
const mockCaptured: Captured[] = [];
jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: () => {},
  withScope: (run: (scope: unknown) => void) => {
    const event: Captured = { exception: undefined, contexts: {} };
    mockCaptured.push(event);
    run({
      setContext: (name: string, value: unknown) => {
        event.contexts[name] = value;
      },
      setFingerprint: (fingerprint: string[]) => {
        event.fingerprint = fingerprint;
      },
      setExtra: () => {},
    });
  },
  captureException: (exception: unknown) => {
    mockCaptured[mockCaptured.length - 1].exception = exception;
  },
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

import { onlineManager } from "@tanstack/react-query";
import { AxiosError, type AxiosResponse } from "axios";
import { clearMmkv } from "@/test-utils/mmkv";
import {
  isErrorReported,
  markErrorReported,
  markExpectedError,
} from "./errors";
import { logAndCaptureError, readFromLog } from "./log";
import { reportDataError, shouldReportDataError } from "./reportDataError";
import { settleSeerrFailure } from "./seerr/errorReporting";

// The session's memory outlives a test, so each one fails in its own place.
let serverCount = 0;
const newServer = () => `https://data-${++serverCount}.example.com`;

const httpError = (
  server: string,
  path: string,
  status: number,
  headers: Record<string, string> = {},
  data?: unknown,
) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_RESPONSE,
    { method: "get", url: `${server}${path}`, headers: {} as never },
    {},
    { status, headers, data, config: {} } as unknown as AxiosResponse,
  );

beforeEach(() => {
  mockCaptured.length = 0;
  onlineManager.setOnline(true);
});

describe("shouldReportDataError", () => {
  test("a server's own failure is reported", () => {
    expect(shouldReportDataError(httpError(newServer(), "/Items", 500))).toBe(
      true,
    );
    expect(shouldReportDataError(new Error("boom"))).toBe(true);
  });

  test("nothing is reported while offline", () => {
    onlineManager.setOnline(false);
    expect(shouldReportDataError(new Error("boom"))).toBe(false);
  });

  test("an expected outcome and an already reported error are skipped", () => {
    expect(shouldReportDataError(markExpectedError(new Error("x")))).toBe(
      false,
    );
    expect(shouldReportDataError(markErrorReported(new Error("x")))).toBe(
      false,
    );
  });

  test("a session that expired is skipped", () => {
    expect(shouldReportDataError(httpError(newServer(), "/Items", 401))).toBe(
      false,
    );
  });

  test("a tunnel that is down and a gateway's refusal are skipped", () => {
    expect(shouldReportDataError(httpError(newServer(), "/Items", 530))).toBe(
      false,
    );
    expect(
      shouldReportDataError(
        httpError(newServer(), "/Items", 403, { "content-type": "text/html" }),
      ),
    ).toBe(false);
  });

  // Going by the header alone, this one was reported here, and could be
  // captured by a call site as well.
  test("a gateway's page is skipped whatever content type it came under", () => {
    const page = "<!DOCTYPE html><html><title>Access denied</title>";
    expect(
      shouldReportDataError(httpError(newServer(), "/Items", 403, {}, page)),
    ).toBe(false);
    expect(
      shouldReportDataError(
        httpError(
          newServer(),
          "/Items",
          403,
          { "content-type": "text/plain" },
          page,
        ),
      ),
    ).toBe(false);
  });

  test("a 403 the server sent itself is reported", () => {
    expect(
      shouldReportDataError(
        httpError(newServer(), "/Items", 403, {}, "Forbidden"),
      ),
    ).toBe(true);
    expect(
      shouldReportDataError(
        httpError(
          newServer(),
          "/Items",
          403,
          { "content-type": "application/json" },
          { message: "Forbidden" },
        ),
      ),
    ).toBe(true);
  });
});

describe("reportDataError", () => {
  test("names the query and the route, and nothing past the key's name", () => {
    reportDataError(
      "query",
      ["home", "the user's search text"],
      httpError(newServer(), "/Items/Latest", 500),
    );
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].fingerprint).toEqual([
      "data-layer",
      "query",
      "home",
      "GET",
      "/Items/Latest",
      "500",
    ]);
    expect(mockCaptured[0].contexts.data_layer).toEqual({
      source: "query",
      key: "home",
      keyLength: 2,
    });
  });

  test("a refetch of the failing query is not a second event", () => {
    const server = newServer();
    reportDataError("query", ["home"], httpError(server, "/Items", 500));
    reportDataError("query", ["home"], httpError(server, "/Items", 500));
    expect(mockCaptured).toHaveLength(1);
  });

  // One server answered 500 on seven routes in the same minute, and each
  // query opened an issue of its own.
  test("one server failing on every query at once is one event", () => {
    const server = newServer();
    reportDataError("query", ["home"], httpError(server, "/Items", 500));
    reportDataError("query", ["userViews"], httpError(server, "/Views", 500));
    reportDataError("query", ["nextUp"], httpError(server, "/NextUp", 500));
    expect(mockCaptured).toHaveLength(1);
  });

  test("a single query failing on its own is reported, whatever the status", () => {
    for (const status of [400, 404, 500]) {
      reportDataError(
        "query",
        ["item"],
        httpError(newServer(), "/Items", status),
      );
    }
    expect(mockCaptured).toHaveLength(3);
  });

  // REACT-NATIVE-3C, 6B, 87: a 400 on /Items and /Items/Latest came with the
  // route and the status and nothing to say whether Jellyfin rejected a
  // parameter or a proxy answered in its place.
  test("the server's answer is described next to the route", () => {
    reportDataError(
      "query",
      ["library-items"],
      httpError(
        newServer(),
        "/Items",
        400,
        { "content-type": "application/problem+json", server: "Kestrel" },
        { status: 400, errors: { sortBy: ["The value 'Foo' is not valid."] } },
      ),
    );
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].contexts.http_response).toEqual({
      status: 400,
      contentType: "application/problem+json",
      server: "Kestrel",
      bodyKind: "json",
      bodyKeys: ["status", "errors"],
      errorFields: ["sortBy"],
    });
  });

  test("a failure with no HTTP response is reported once per query", () => {
    reportDataError("mutation", ["play"], new TypeError("x is undefined"));
    reportDataError("mutation", ["play"], new TypeError("x is undefined"));
    reportDataError("mutation", ["other"], new TypeError("x is undefined"));
    expect(mockCaptured).toHaveLength(2);
  });

  // REACT-NATIVE-28 and its iOS siblings: the awards badge asking Wikidata
  // from a network that does not reach it. expo/fetch's rejection is a plain
  // Error, which this took for a failure of the app's.
  test("a fetch that got no answer is not reported", () => {
    reportDataError(
      "query",
      ["wikidata", "awards", "tt0111161"],
      new Error(
        'fetch failed: java.net.UnknownHostException: Unable to resolve host "www.wikidata.org": No address associated with hostname',
      ),
    );
    reportDataError(
      "query",
      ["wikidata", "awards", "tt0111161"],
      new Error(
        "fetch failed: UnexpectedException: The Internet connection appears to be offline. (at ExpoModulesCore/Promise.swift:56)",
      ),
    );
    expect(mockCaptured).toHaveLength(0);
  });

  test("a Streamystats server without the route is not a failure", () => {
    reportDataError(
      "query",
      ["streamystats"],
      httpError(newServer(), "/api/watchlists", 404),
    );
    expect(mockCaptured).toHaveLength(0);
  });

  test("what the cache reported, a call site catching it does not report again", () => {
    const error = new Error("mutation failed");
    reportDataError("mutation", ["request"], error);
    expect(isErrorReported(error)).toBe(true);
    logAndCaptureError("Request failed", error);
    expect(mockCaptured).toHaveLength(1);
  });

  test("what a call site reported, the cache does not report again", () => {
    const error = httpError(newServer(), "/Items", 500);
    logAndCaptureError("Loading items failed", error);
    reportDataError("query", ["items"], error);
    expect(mockCaptured).toHaveLength(1);
  });
});

// The cache is restored from disk for up to a day, so the app asks for ids an
// earlier session saw. A library renamed or deleted has a new id or none, and
// Jellyfin says so. That is not a bug of the app's; every other 400 and 404
// still is.
describe("reportDataError for an id the server no longer has", () => {
  const STALE = "5e1c0f9d2b7a4c38a6e2d4f1b3c5a7e9";
  const OTHER_STALE = "9a8b7c6d5e4f40312a1b0c9d8e7f6a5b";
  const SEASON = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
  const unknownParent = (server: string, query: string, path = "/Items") =>
    httpError(
      server,
      `${path}?userId=u1&${query}`,
      400,
      { "content-type": "text/plain", server: "Kestrel" },
      "Error processing request.",
    );

  // REACT-NATIVE-6B (library-items), 3C (library-count), S8 (library-data).
  test.each([
    ["library-items", `parentId=${STALE}&sortBy=SortName&sortOrder=Ascending`],
    ["library-count", `parentId=${STALE}&recursive=true&limit=0`],
    ["library-data", `parentId=${STALE}&limit=12`],
  ])("a library that is gone is not reported (%s)", (key, query) => {
    reportDataError("query", [key, STALE], unknownParent(newServer(), query));
    expect(mockCaptured).toHaveLength(0);
  });

  test("its filters are not reported either", () => {
    reportDataError(
      "query",
      ["filters", "Genres", "genreFilter", STALE],
      unknownParent(newServer(), `parentId=${STALE}`, "/Items/Filters"),
    );
    expect(mockCaptured).toHaveLength(0);
  });

  // Not reported, so the local log is all that is left of it: which query
  // asked, on which route, once per session, and nothing that names the
  // library or the server. The session's memory outlives a test, so these
  // query names are this test's own.
  test("is written to the local log once per query and route, without the id", () => {
    clearMmkv();
    const server = newServer();
    reportDataError(
      "query",
      ["stale-grid", STALE],
      unknownParent(server, `parentId=${STALE}&limit=36`),
    );
    // The same query and route again, for another server and another id.
    reportDataError(
      "query",
      ["stale-grid", OTHER_STALE],
      unknownParent(newServer(), `parentId=${OTHER_STALE}`),
    );
    reportDataError(
      "query",
      ["stale-count", STALE],
      unknownParent(server, `parentId=${STALE}&limit=0`),
    );
    reportDataError(
      "query",
      ["stale-grid", STALE],
      unknownParent(server, `parentId=${STALE}`, "/Items/Filters"),
    );
    // Reported, so not written here.
    reportDataError(
      "query",
      ["stale-grid", STALE],
      unknownParent(newServer(), `parentId=${STALE}&years=NaN`),
    );

    expect(mockCaptured).toHaveLength(1);
    const entries = readFromLog();
    const line = (key: string, route: string) => ({
      level: "WARN",
      message: "Asked for an id the server no longer has",
      data: { source: "query", key, method: "GET", route, status: 400 },
    });
    expect(
      entries.map(({ level, message, data }) => ({ level, message, data })),
    ).toEqual([
      line("stale-grid", "/Items"),
      line("stale-count", "/Items"),
      line("stale-grid", "/Items/Filters"),
    ]);
    const written = JSON.stringify(entries);
    for (const secret of [STALE, OTHER_STALE, "example.com", "processing"]) {
      expect(written).not.toContain(secret);
    }
  });

  describe("what still is", () => {
    test("a parentId the server could not read", () => {
      reportDataError(
        "query",
        ["library-items"],
        httpError(
          newServer(),
          "/Items?parentId=abc",
          400,
          { "content-type": "application/problem+json", server: "Kestrel" },
          {
            title: "One or more validation errors occurred.",
            status: 400,
            errors: { parentId: ["The value 'abc' is not valid."] },
          },
        ),
      );
      expect(mockCaptured).toHaveLength(1);
      expect(mockCaptured[0].contexts.http_response).toMatchObject({
        errorFields: ["parentId"],
      });
    });

    test("the same 400 to a request that named no parent", () => {
      reportDataError(
        "query",
        ["library-items"],
        unknownParent(newServer(), "recursive=true"),
      );
      expect(mockCaptured).toHaveLength(1);
    });

    // "Guid can't be empty", in the same words: a fault of the request.
    test("the same 400 to a request whose parent is the empty GUID", () => {
      reportDataError(
        "query",
        ["library-items"],
        unknownParent(
          newServer(),
          "parentId=00000000-0000-0000-0000-000000000000",
        ),
      );
      expect(mockCaptured).toHaveLength(1);
    });

    test("the same 400 to a request that also sent a year that is no number", () => {
      reportDataError(
        "query",
        ["library-items"],
        unknownParent(newServer(), `parentId=${STALE}&years=NaN`),
      );
      expect(mockCaptured).toHaveLength(1);
    });

    test("the same 400 to a request with more sort orders than sort fields", () => {
      reportDataError(
        "query",
        ["library-items"],
        unknownParent(
          newServer(),
          `parentId=${STALE}&sortBy=SortName&sortOrder=Ascending&sortOrder=Descending`,
        ),
      );
      expect(mockCaptured).toHaveLength(1);
    });

    test("the same 400 from another route", () => {
      reportDataError(
        "query",
        ["home"],
        unknownParent(newServer(), `parentId=${STALE}`, "/Items/Latest"),
      );
      expect(mockCaptured).toHaveLength(1);
    });

    test.each([
      ["library", `/Items/${STALE}`],
      ["nextUp", "/Shows/NextUp?userId=u1"],
    ])("a 404 anywhere else (%s)", (key, path) => {
      reportDataError("query", [key], httpError(newServer(), path, 404));
      expect(mockCaptured).toHaveLength(1);
    });

    // REACT-NATIVE-22 (episodes), 11 (AllEpisodes), 4W (seasons). Jellyfin
    // answers these for any id that is not a series or a season the user can
    // see: one that is gone, but also the id of another kind of item, which
    // is the app's bug, and one the user may not open.
    test.each([
      [
        "episodes",
        `/Shows/${STALE}/Episodes?userId=u1&seasonId=${SEASON}`,
        `No season exists with Id ${SEASON}`,
      ],
      ["AllEpisodes", `/Shows/${STALE}/Episodes?userId=u1`, "Series not found"],
      [
        "seasons",
        `/Shows/${STALE}/Seasons`,
        { title: "Not Found", status: 404 },
      ],
    ])("a series' 404 (%s)", (key, path, body) => {
      reportDataError(
        "query",
        [key, STALE],
        httpError(newServer(), path, 404, { server: "Kestrel" }, body),
      );
      expect(mockCaptured).toHaveLength(1);
    });
  });
});

// Seerr errors pass the client's response interceptor first and are then
// rethrown into React Query: the two used to disagree about what is worth
// reporting, and to report the same failure once each.
describe("reportDataError — Seerr failures after the interceptor", () => {
  const seerrError = (path: string, status: number, method = "get") =>
    new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_RESPONSE,
      { method, baseURL: newServer(), url: path, headers: {} as never },
      {},
      { status, headers: {}, config: {} } as unknown as AxiosResponse,
    );
  const intercept = (error: AxiosError) =>
    settleSeerrFailure(error, () =>
      logAndCaptureError("Seerr response error", error),
    );

  // ~40 users, ~90 events: a title with no Rotten Tomatoes entry.
  test("a title without ratings is not reported by either", () => {
    const error = seerrError("/api/v1/tv/1368337/ratings", 404);
    intercept(error);
    reportDataError("query", ["seerr"], error);
    expect(mockCaptured).toHaveLength(0);
  });

  test("a Seerr without the Jellyfin user route is not reported by either", () => {
    const error = seerrError("/api/v1/user/jellyfin/abc", 404);
    intercept(error);
    reportDataError("mutation", undefined, error);
    expect(mockCaptured).toHaveLength(0);
  });

  // React Query retries three times: the interceptor sees four errors, and
  // the cache is handed the last one, which the interceptor's throttle had
  // passed over without a mark.
  test("a failure retried three times is one event, the interceptor's", () => {
    const base = newServer();
    const attempts = Array.from(
      { length: 4 },
      () =>
        new AxiosError(
          "Request failed with status code 500",
          AxiosError.ERR_BAD_RESPONSE,
          {
            method: "get",
            baseURL: base,
            url: "/api/v1/discover/trending",
            headers: {} as never,
          },
          {},
          { status: 500, headers: {}, config: {} } as unknown as AxiosResponse,
        ),
    );
    for (const attempt of attempts) intercept(attempt);
    reportDataError("query", ["seerr"], attempts[3]);
    expect(mockCaptured).toHaveLength(1);
    expect(mockCaptured[0].fingerprint?.[0]).toBe("Seerr response error");
  });
});
