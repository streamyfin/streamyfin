import { AxiosError, type AxiosResponse } from "axios";
import {
  describeHttpError,
  describeHttpResponse,
  isAbortLikeError,
  isConnectivityError,
  isEnvironmentError,
  isGatewayBlockError,
  isGatewayStatus,
  templateRequestPath,
} from "./errors";

const httpError = (
  status: number | undefined,
  {
    method = "get",
    url = "https://jellyfin.example.com/Items",
    headers = {},
    data,
  }: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    data?: unknown;
  } = {},
) =>
  new AxiosError(
    status ? `Request failed with status code ${status}` : "Network Error",
    status ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_NETWORK,
    { method, url, headers: {} as never },
    {},
    status
      ? ({ status, headers, data, config: {} } as unknown as AxiosResponse)
      : undefined,
  );

describe("templateRequestPath", () => {
  test("drops the origin and query string", () => {
    expect(
      templateRequestPath("https://my.server:8096/Users/Me?api_key=secret"),
    ).toBe("/Users/Me");
  });

  test("replaces GUIDs, hex ids and numbers with :id", () => {
    expect(
      templateRequestPath(
        "https://host/Users/3fa85f64-5717-4562-b3fc-2c963f66afa6/Items/f0e1d2c3b4a5968778695a4b3c2d1e0f/Images/Primary/0",
      ),
    ).toBe("/Users/:id/Items/:id/Images/Primary/:id");
    expect(templateRequestPath("/api/v1/tv/1368337/ratings")).toBe(
      "/api/v1/tv/:id/ratings",
    );
  });

  test("replaces free-text segments with :param", () => {
    expect(templateRequestPath("https://host/Persons/Tom%20Hanks")).toBe(
      "/Persons/:param",
    );
    expect(templateRequestPath("https://host/Videos/x/Show%20S01E02.mp4")).toBe(
      "/Videos/x/:param",
    );
  });

  test("keeps route words, including a server base path", () => {
    expect(
      templateRequestPath(
        "http://192.168.1.2/jellyfin/Sessions/Capabilities/Full",
      ),
    ).toBe("/jellyfin/Sessions/Capabilities/Full");
    expect(templateRequestPath("https://host/generate_204")).toBe(
      "/generate_204",
    );
  });

  test("handles missing and relative urls", () => {
    expect(templateRequestPath(undefined)).toBe("?");
    expect(templateRequestPath("Items/Latest?limit=5")).toBe("Items/Latest");
  });
});

describe("describeHttpError", () => {
  test("describes an HTTP response by method, route and status", () => {
    expect(
      describeHttpError(
        httpError(404, {
          method: "post",
          url: "https://host/Sessions/Capabilities/Full",
        }),
      ),
    ).toEqual({
      method: "POST",
      path: "/Sessions/Capabilities/Full",
      status: 404,
    });
  });

  test("is null without a response or for non-axios errors", () => {
    expect(describeHttpError(httpError(undefined))).toBeNull();
    expect(describeHttpError(new Error("boom"))).toBeNull();
    expect(describeHttpError("string")).toBeNull();
  });
});

describe("isConnectivityError", () => {
  test("no HTTP response is connectivity", () => {
    expect(isConnectivityError(httpError(undefined))).toBe(true);
    expect(isConnectivityError(new TypeError("Network request failed"))).toBe(
      true,
    );
  });

  test("gateway statuses are connectivity, other statuses are not", () => {
    expect(isConnectivityError(httpError(502))).toBe(true);
    expect(isConnectivityError(httpError(503))).toBe(true);
    expect(isConnectivityError(httpError(504))).toBe(true);
    expect(isConnectivityError(httpError(500))).toBe(false);
    expect(isConnectivityError(httpError(404))).toBe(false);
    expect(isConnectivityError(httpError(401))).toBe(false);
  });

  test("Cloudflare origin-down statuses are connectivity", () => {
    expect(isConnectivityError(httpError(521))).toBe(true);
    expect(isConnectivityError(httpError(522))).toBe(true);
    expect(isConnectivityError(httpError(523))).toBe(true);
  });

  // A stopped Cloudflare Tunnel answers 530 ("Error 1033") on every route:
  // seven issues from five users, one per route that happened to be in
  // flight.
  test.each([520, 524, 525, 526, 530])(
    "Cloudflare's %i is connectivity: the origin gave it no answer",
    (status) => {
      expect(isConnectivityError(httpError(status))).toBe(true);
    },
  );

  test("statuses a server sends itself are not swept up with them", () => {
    expect(isConnectivityError(httpError(501))).toBe(false);
    expect(isConnectivityError(httpError(505))).toBe(false);
    expect(isConnectivityError(httpError(507))).toBe(false);
  });
});

describe("isGatewayStatus", () => {
  test("says the same of a bare status as of an axios error", () => {
    expect(isGatewayStatus(502)).toBe(true);
    expect(isGatewayStatus(530)).toBe(true);
    expect(isGatewayStatus(500)).toBe(false);
    expect(isGatewayStatus(403)).toBe(false);
  });
});

// One user behind a Cloudflare WAF rule: 24 events across 9 issues in two
// minutes, every Jellyfin route answering 403 with Cloudflare's HTML page.
describe("isGatewayBlockError", () => {
  test("a 403 with an HTML page is the gateway's refusal", () => {
    expect(
      isGatewayBlockError(
        httpError(403, {
          headers: { "content-type": "text/html; charset=UTF-8" },
          data: "<!DOCTYPE html><title>Attention Required!</title>",
        }),
      ),
    ).toBe(true);
  });

  test("a 403 the server sent itself is not", () => {
    expect(
      isGatewayBlockError(
        httpError(403, {
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      ),
    ).toBe(false);
    expect(
      isGatewayBlockError(
        httpError(403, { headers: { "content-type": "text/plain" } }),
      ),
    ).toBe(false);
    // Jellyfin refuses with an empty body and no content type.
    expect(isGatewayBlockError(httpError(403))).toBe(false);
  });

  // An HTML 404 or 500 can be the app asking a proxy for a path that is not
  // there, which is the app's bug to hear about.
  test("an HTML page under another status is still reported", () => {
    const html = { headers: { "content-type": "text/html" } };
    expect(isGatewayBlockError(httpError(404, html))).toBe(false);
    expect(isGatewayBlockError(httpError(500, html))).toBe(false);
  });

  test("is false for anything that is not an HTTP response", () => {
    expect(isGatewayBlockError(httpError(undefined))).toBe(false);
    expect(isGatewayBlockError(new Error("403"))).toBe(false);
    expect(isGatewayBlockError("403")).toBe(false);
  });
});

// A gateway does not always say what it sends. Going by the header alone, a
// page sent without one, or under the wrong one, was reported as the
// server's refusal.
describe("isGatewayBlockError — a page the content type does not announce", () => {
  const PAGE = "<!DOCTYPE html><html><head><title>Access denied</title></head>";
  const blocked = (data: unknown, contentType?: string, status = 403) =>
    isGatewayBlockError(
      httpError(status, {
        headers: contentType ? { "content-type": contentType } : {},
        data,
      }),
    );

  test("an HTML page with no content type is the gateway's refusal", () => {
    expect(blocked(PAGE)).toBe(true);
  });

  test("an HTML page under a wrong content type is the gateway's refusal", () => {
    expect(blocked(PAGE, "text/plain")).toBe(true);
    expect(blocked(PAGE, "application/octet-stream")).toBe(true);
  });

  test("whitespace or a byte order mark before the page does not hide it", () => {
    expect(blocked(`\n\n  \t${PAGE}`)).toBe(true);
    expect(blocked(`﻿${PAGE}`)).toBe(true);
    expect(blocked(`﻿\r\n${PAGE}`)).toBe(true);
  });

  test("a page that opens with its html tag, in any case", () => {
    expect(blocked("<html><body>403 Forbidden</body></html>")).toBe(true);
    expect(blocked('<HTML lang="en"><BODY>Forbidden')).toBe(true);
    expect(blocked("<!doctype html>\n<html>")).toBe(true);
    expect(
      blocked('<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN"><html>'),
    ).toBe(true);
  });

  // What Jellyfin and Seerr refuse with.
  test("a JSON body is the server's refusal", () => {
    expect(blocked('{"message":"Forbidden"}')).toBe(false);
    expect(blocked('{"message":"Forbidden"}', "application/json")).toBe(false);
    expect(blocked('"Forbidden"', "application/json")).toBe(false);
  });

  test("a plain-text body is the server's refusal", () => {
    expect(blocked("Forbidden")).toBe(false);
    expect(blocked("Forbidden", "text/plain")).toBe(false);
  });

  test("an empty body is the server's refusal", () => {
    expect(blocked("")).toBe(false);
    expect(blocked(undefined)).toBe(false);
    expect(blocked(null)).toBe(false);
  });

  test("a body axios parsed into an object is the server's refusal", () => {
    expect(blocked({ message: "Forbidden" })).toBe(false);
    expect(blocked({ html: PAGE })).toBe(false);
    expect(blocked([PAGE])).toBe(false);
  });

  test("an HTML page under another status is still reported", () => {
    expect(blocked(PAGE, undefined, 404)).toBe(false);
    expect(blocked(PAGE, undefined, 500)).toBe(false);
    expect(blocked(PAGE, "text/plain", 400)).toBe(false);
  });

  // The body is a document, not a text that mentions one.
  test("markup that is not the start of an HTML document does not count", () => {
    expect(blocked("Forbidden <html>")).toBe(false);
    expect(blocked("<?xml version='1.0'?><error>Forbidden</error>")).toBe(
      false,
    );
    expect(blocked("<htmlish>Forbidden</htmlish>")).toBe(false);
    expect(blocked("<!doctype htmlx>")).toBe(false);
  });

  // Only the start of the body is read, however large the page.
  test("a page that starts beyond the first characters is not searched for", () => {
    expect(blocked(`${" ".repeat(100)}${PAGE}`)).toBe(true);
    expect(blocked(`${" ".repeat(5_000)}${PAGE}`)).toBe(false);
    expect(blocked(`${PAGE}${"x".repeat(2_000_000)}`)).toBe(true);
  });
});

describe("isEnvironmentError", () => {
  test("covers an unreachable server and a gateway's refusal", () => {
    expect(isEnvironmentError(httpError(undefined))).toBe(true);
    expect(isEnvironmentError(httpError(530))).toBe(true);
    expect(
      isEnvironmentError(
        httpError(403, { headers: { "content-type": "text/html" } }),
      ),
    ).toBe(true);
    expect(
      isEnvironmentError(
        httpError(403, { data: "<!DOCTYPE html><html><body>Blocked" }),
      ),
    ).toBe(true);
  });

  test("leaves the answers of the server itself alone", () => {
    expect(isEnvironmentError(httpError(403))).toBe(false);
    expect(isEnvironmentError(httpError(404))).toBe(false);
    expect(isEnvironmentError(httpError(500))).toBe(false);
    expect(isEnvironmentError(new Error("boom"))).toBe(false);
  });
});

describe("isAbortLikeError", () => {
  test("expo/fetch cancellations are aborts despite the plain Error shape", () => {
    expect(
      isAbortLikeError(
        new Error(
          "fetch failed: FetchRequestCanceledException: Fetch request has been canceled",
        ),
      ),
    ).toBe(true);
  });

  test("other plain errors are not aborts", () => {
    expect(isAbortLikeError(new Error("fetch failed: connection lost"))).toBe(
      false,
    );
    expect(isAbortLikeError(httpError(404))).toBe(false);
  });
});

describe("describeHttpResponse", () => {
  test("keeps a plain-text reason and the Server header", () => {
    expect(
      describeHttpResponse(
        httpError(404, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            server: "Kestrel",
          },
          data: "Session not found.",
        }),
      ),
    ).toEqual({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      server: "Kestrel",
      body: "Session not found.",
    });
  });

  test("serialises and truncates a JSON body", () => {
    const described = describeHttpResponse(
      httpError(404, {
        headers: { "content-type": "application/problem+json" },
        data: { title: "Not Found", detail: "x".repeat(400) },
      }),
    );
    expect(described?.body).toMatch(/^\{"title":"Not Found"/);
    expect(described?.body).toHaveLength(200);
  });

  test("drops an HTML body but keeps the headers", () => {
    expect(
      describeHttpResponse(
        httpError(404, {
          headers: { "content-type": "text/html", server: "nginx/1.25" },
          data: "<html><title>my-private-host.duckdns.org</title></html>",
        }),
      ),
    ).toEqual({
      status: 404,
      contentType: "text/html",
      server: "nginx/1.25",
      body: undefined,
    });
  });

  test("is undefined without a response", () => {
    expect(describeHttpResponse(httpError(undefined))).toBeUndefined();
    expect(describeHttpResponse(new Error("boom"))).toBeUndefined();
  });
});
