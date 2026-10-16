import { AxiosError, type AxiosResponse } from "axios";
import { HTTP_FAILURE_STORM_WINDOW_MS } from "@/constants/Sentry";
import { admitHttpFailure } from "./httpFailureGate";

// The gate remembers for the whole session, which in a spec is the whole
// file: every test talks to a server of its own.
let serverCount = 0;
const newServer = () => `https://server-${++serverCount}.example.com`;

const failure = (
  server: string,
  path: string,
  status: number,
  method = "get",
) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_RESPONSE,
    { method, url: `${server}${path}`, headers: {} as never },
    {},
    { status, headers: {}, config: {} } as unknown as AxiosResponse,
  );

const T0 = 1_000_000;

describe("admitHttpFailure — one event per route and status per session", () => {
  test("a route failing on its own is reported", () => {
    expect(admitHttpFailure(failure(newServer(), "/Items", 500), T0)).toBe(
      "report",
    );
  });

  test("the same route failing again is a duplicate, however much later", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Items", 500), T0)).toBe("report");
    expect(admitHttpFailure(failure(server, "/Items", 500), T0 + 1)).toBe(
      "duplicate",
    );
    expect(
      admitHttpFailure(
        failure(server, "/Items", 500),
        T0 + 10 * HTTP_FAILURE_STORM_WINDOW_MS,
      ),
    ).toBe("duplicate");
  });

  // The native player fetches the item and fails, then the JS player fetches
  // the same item and fails: two error objects, two messages, one failure.
  test("two requests for the same record are the same route", () => {
    const server = newServer();
    const itemA = "/Users/3fa85f64-5717-4562-b3fc-2c963f66afa6/Items/1";
    const itemB = "/Users/3fa85f64-5717-4562-b3fc-2c963f66afa6/Items/2";
    expect(admitHttpFailure(failure(server, itemA, 404), T0)).toBe("report");
    expect(admitHttpFailure(failure(server, itemB, 404), T0 + 5)).toBe(
      "duplicate",
    );
  });

  test("the same route with another method or status is its own failure", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Sessions", 500), T0)).toBe(
      "report",
    );
    expect(
      admitHttpFailure(failure(server, "/Sessions", 400, "post"), T0),
    ).toBe("report");
  });

  test("a relative url is told apart by the client's base url", () => {
    const seerr = (baseURL: string) =>
      new AxiosError(
        "Request failed with status code 500",
        AxiosError.ERR_BAD_RESPONSE,
        { method: "get", baseURL, url: "/api/v1/status", headers: {} as never },
        {},
        { status: 500, headers: {}, config: {} } as unknown as AxiosResponse,
      );
    expect(admitHttpFailure(seerr(newServer()), T0)).toBe("report");
    expect(admitHttpFailure(seerr(newServer()), T0)).toBe("report");
  });

  test("anything that is not an HTTP response is left to the caller", () => {
    expect(admitHttpFailure(new Error("boom"), T0)).toBe("report");
    expect(admitHttpFailure(new Error("boom"), T0)).toBe("report");
    expect(admitHttpFailure("Download failed", T0)).toBe("report");
  });
});

// One user's server answered 500 on seven routes within a minute: seven
// issues for one broken database.
describe("admitHttpFailure — one server's bad minute is one event", () => {
  test("other routes failing with the same status right after are a storm", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Items", 500), T0)).toBe("report");
    expect(
      admitHttpFailure(failure(server, "/UserViews", 500), T0 + 1_000),
    ).toBe("storm");
    expect(
      admitHttpFailure(failure(server, "/Shows/NextUp", 500), T0 + 30_000),
    ).toBe("storm");
  });

  test("another status in the same minute is not part of it", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Items", 500), T0)).toBe("report");
    expect(admitHttpFailure(failure(server, "/UserViews", 404), T0 + 1)).toBe(
      "report",
    );
  });

  test("another server in the same minute is not part of it", () => {
    expect(admitHttpFailure(failure(newServer(), "/Items", 500), T0)).toBe(
      "report",
    );
    expect(
      admitHttpFailure(failure(newServer(), "/UserViews", 500), T0 + 1),
    ).toBe("report");
  });

  test("a different route failing once the window has passed is reported", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Items", 500), T0)).toBe("report");
    expect(
      admitHttpFailure(
        failure(server, "/UserViews", 500),
        T0 + HTTP_FAILURE_STORM_WINDOW_MS,
      ),
    ).toBe("report");
  });

  // What the storm silenced is not remembered as reported: a route that is
  // broken for a reason of its own is still failing when the window is over.
  test("a route silenced by a storm is reported when it fails after it", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Items", 500), T0)).toBe("report");
    expect(admitHttpFailure(failure(server, "/UserViews", 500), T0 + 1)).toBe(
      "storm",
    );
    expect(
      admitHttpFailure(
        failure(server, "/UserViews", 500),
        T0 + HTTP_FAILURE_STORM_WINDOW_MS + 1,
      ),
    ).toBe("report");
  });

  // A session that ended, a refusal and a rate limit meet every route alike.
  test.each([401, 403, 429, 503])(
    "a %i on every route is one event as well",
    (status) => {
      const server = newServer();
      expect(admitHttpFailure(failure(server, "/Items", status), T0)).toBe(
        "report",
      );
      expect(
        admitHttpFailure(failure(server, "/UserViews", status), T0 + 1_000),
      ).toBe("storm");
    },
  );

  // Otherwise a route failing every few seconds would keep every other route
  // of the server quiet for the whole session.
  test("what a storm silences does not extend it", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Items", 500), T0)).toBe("report");
    expect(
      admitHttpFailure(
        failure(server, "/UserViews", 500),
        T0 + HTTP_FAILURE_STORM_WINDOW_MS - 1,
      ),
    ).toBe("storm");
    expect(
      admitHttpFailure(
        failure(server, "/Shows/NextUp", 500),
        T0 + HTTP_FAILURE_STORM_WINDOW_MS + 1,
      ),
    ).toBe("report");
  });
});

// A 404 on POST /Sessions/Capabilities/Full, which some servers answer at
// every launch, kept every other 404 of the first two minutes out: the whole
// home screen load, and a wrong path there is the app's own bug.
describe("admitHttpFailure — a status that answers one request is no storm", () => {
  test.each([400, 404, 405, 409, 422])(
    "a %i on one route does not silence the same status on another",
    (status) => {
      const server = newServer();
      expect(
        admitHttpFailure(
          failure(server, "/Sessions/Capabilities/Full", status, "post"),
          T0,
        ),
      ).toBe("report");
      expect(
        admitHttpFailure(failure(server, "/Items/Latest", status), T0 + 1_000),
      ).toBe("report");
      expect(
        admitHttpFailure(failure(server, "/UserViews", status), T0 + 2_000),
      ).toBe("report");
    },
  );

  test("each of those routes is still reported once per session", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Items/Latest", 404), T0)).toBe(
      "report",
    );
    expect(admitHttpFailure(failure(server, "/UserViews", 404), T0 + 1)).toBe(
      "report",
    );
    expect(admitHttpFailure(failure(server, "/UserViews", 404), T0 + 2)).toBe(
      "duplicate",
    );
  });

  test("it does not open a window for the statuses that do storm", () => {
    const server = newServer();
    expect(admitHttpFailure(failure(server, "/Items", 404), T0)).toBe("report");
    expect(admitHttpFailure(failure(server, "/UserViews", 500), T0 + 1)).toBe(
      "report",
    );
  });
});
