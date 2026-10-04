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
import {
  isErrorReported,
  markErrorReported,
  markExpectedError,
} from "./errors";
import { logAndCaptureError } from "./log";
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
) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_RESPONSE,
    { method: "get", url: `${server}${path}`, headers: {} as never },
    {},
    { status, headers, config: {} } as unknown as AxiosResponse,
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

  test("a failure with no HTTP response is reported once per query", () => {
    reportDataError("mutation", ["play"], new TypeError("x is undefined"));
    reportDataError("mutation", ["play"], new TypeError("x is undefined"));
    reportDataError("mutation", ["other"], new TypeError("x is undefined"));
    expect(mockCaptured).toHaveLength(2);
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
