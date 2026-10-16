import { SEERR_REPORT_THROTTLE_MS } from "@/constants/Sentry";
import { isErrorReported, isExpectedError } from "@/utils/errors";
import { isExpectedSeerrResponse, settleSeerrFailure } from "./errorReporting";

const failure = (status: number, url: string, method = "get") => ({
  response: { status },
  config: { method, url },
});

describe("isExpectedSeerrResponse", () => {
  test("a title Rotten Tomatoes does not know, or could not be asked about", () => {
    expect(
      isExpectedSeerrResponse(404, "get", "/api/v1/tv/1368337/ratings"),
    ).toBe(true);
    expect(
      isExpectedSeerrResponse(500, "get", "/api/v1/movie/603/ratings"),
    ).toBe(true);
  });

  test("a Seerr that predates a route the app falls back from", () => {
    expect(
      isExpectedSeerrResponse(404, "get", "/api/v1/user/jellyfin/abc123"),
    ).toBe(true);
    expect(
      isExpectedSeerrResponse(
        404,
        "post",
        "/api/v1/auth/jellyfin/quickconnect/initiate",
      ),
    ).toBe(true);
  });

  test("a request Seerr refuses to take", () => {
    expect(isExpectedSeerrResponse(400, "post", "/api/v1/request")).toBe(true);
    expect(isExpectedSeerrResponse(400, "POST", "/api/v1/request")).toBe(true);
  });

  test("a session that ended, or an action the user may not take", () => {
    expect(isExpectedSeerrResponse(401, "get", "/api/v1/auth/me")).toBe(true);
    expect(isExpectedSeerrResponse(403, "post", "/api/v1/request")).toBe(true);
  });

  test("the same routes failing any other way are defects", () => {
    expect(isExpectedSeerrResponse(502, "get", "/api/v1/tv/1/ratings")).toBe(
      false,
    );
    expect(isExpectedSeerrResponse(500, "get", "/api/v1/user/jellyfin/a")).toBe(
      false,
    );
    expect(isExpectedSeerrResponse(400, "get", "/api/v1/request")).toBe(false);
    expect(isExpectedSeerrResponse(500, "post", "/api/v1/request")).toBe(false);
  });

  test("so is any other route", () => {
    expect(isExpectedSeerrResponse(404, "get", "/api/v1/tv/1")).toBe(false);
    expect(isExpectedSeerrResponse(500, "get", "/api/v1/discover/tv")).toBe(
      false,
    );
    expect(isExpectedSeerrResponse(undefined, undefined, undefined)).toBe(
      false,
    );
  });
});

// The interceptor is not the last to see a Seerr error: it goes on into
// React Query, whose handler reports whatever arrives without a mark.
describe("settleSeerrFailure", () => {
  const T0 = 5_000_000;

  test("an expected answer is marked expected and not reported", () => {
    const error = failure(404, "/api/v1/tv/1368337/ratings");
    const report = jest.fn();
    settleSeerrFailure(error, report, T0);
    expect(report).not.toHaveBeenCalled();
    expect(isExpectedError(error)).toBe(true);
  });

  test("a defect is handed to the reporter, unmarked: marking is its job", () => {
    const error = failure(500, "/api/v1/settings/a");
    const report = jest.fn();
    settleSeerrFailure(error, report, T0);
    expect(report).toHaveBeenCalledWith(error);
    expect(isExpectedError(error)).toBe(false);
  });

  // A retry is a new error object for the same failure. Left unmarked, the
  // last retry was what React Query reported: a second issue per failure.
  test("a retry of a failure just reported is marked reported", () => {
    const report = jest.fn();
    settleSeerrFailure(failure(500, "/api/v1/settings/b"), report, T0);
    const retry = failure(500, "/api/v1/settings/b");
    settleSeerrFailure(retry, report, T0 + 1_000);
    expect(report).toHaveBeenCalledTimes(1);
    expect(isErrorReported(retry)).toBe(true);
  });

  test("the query string is not what tells two failures apart", () => {
    const report = jest.fn();
    settleSeerrFailure(failure(500, "/api/v1/search?query=a"), report, T0);
    settleSeerrFailure(failure(500, "/api/v1/search?query=ab"), report, T0 + 1);
    expect(report).toHaveBeenCalledTimes(1);
  });

  test("the same failure after the throttle goes to the reporter again", () => {
    const report = jest.fn();
    settleSeerrFailure(failure(500, "/api/v1/settings/c"), report, T0);
    settleSeerrFailure(
      failure(500, "/api/v1/settings/c"),
      report,
      T0 + SEERR_REPORT_THROTTLE_MS,
    );
    expect(report).toHaveBeenCalledTimes(2);
  });

  test("another status on the same route is another failure", () => {
    const report = jest.fn();
    settleSeerrFailure(failure(500, "/api/v1/settings/d"), report, T0);
    settleSeerrFailure(failure(404, "/api/v1/settings/d"), report, T0 + 1);
    expect(report).toHaveBeenCalledTimes(2);
  });
});
