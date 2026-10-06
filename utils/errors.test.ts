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
    headers?: Record<string, unknown>;
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

  // REACT-NATIVE-88 / C7 / 77 / C6 (421) and D9 / D8 (444): one user each
  // time, on whichever Streamystats and Seerr routes were in flight.
  test.each([421, 444])(
    "%i is connectivity: a proxy that had no server to hand the request to",
    (status) => {
      expect(isConnectivityError(httpError(status))).toBe(true);
    },
  );

  test("the client statuses around them are still the server's answer", () => {
    for (const status of [400, 403, 404, 409, 422, 429, 451]) {
      expect(isConnectivityError(httpError(status))).toBe(false);
    }
  });

  test("statuses a server sends itself are not swept up with them", () => {
    expect(isConnectivityError(httpError(501))).toBe(false);
    expect(isConnectivityError(httpError(505))).toBe(false);
    expect(isConnectivityError(httpError(507))).toBe(false);
  });
});

// expo/fetch, which is the global fetch on native, rejects with its own
// FetchError: a plain Error whose message is "fetch failed: " and whatever
// the native request was rejected with. Built here the way
// expo/src/winter/fetch/FetchErrors.ts builds it.
const fetchError = (nativeMessage: string) =>
  new Error(`fetch failed: ${nativeMessage}`);

describe("isConnectivityError — expo/fetch", () => {
  // The Wikidata awards badge, from 35 users between them.
  test.each([
    // REACT-NATIVE-28, Android: the IOException OkHttp failed with, as text.
    [
      'java.net.UnknownHostException: Unable to resolve host "www.wikidata.org": No address associated with hostname',
    ],
    // REACT-NATIVE-AB / E1 / ET / HP, iOS: the URLSession error, wrapped.
    [
      "UnexpectedException: A server with the specified hostname could not be found. (at ExpoModulesCore/Promise.swift:56)",
    ],
    [
      "UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)",
    ],
    [
      "UnexpectedException: A TLS error caused the secure connection to fail. (at ExpoModulesCore/Promise.swift:56)",
    ],
    [
      "UnexpectedException: The Internet connection appears to be offline. (at ExpoModulesCore/Promise.swift:56)",
    ],
  ])("a request that got no answer is connectivity: %j", (nativeMessage) => {
    expect(isConnectivityError(fetchError(nativeMessage))).toBe(true);
    expect(isEnvironmentError(fetchError(nativeMessage))).toBe(true);
  });

  test.each([
    ["java.net.SocketTimeoutException: timeout"],
    ["java.net.ConnectException: Failed to connect to /192.168.1.5:8096"],
    ["javax.net.ssl.SSLHandshakeException: Handshake failed"],
    ["java.io.IOException: unexpected end of stream on https://host/..."],
    ["okhttp3.internal.http2.StreamResetException: stream was reset: CANCEL"],
    // An exception that carries no message is its class name alone.
    ["java.net.SocketException"],
  ])(
    "any exception OkHttp gives up with is connectivity: %j",
    (nativeMessage) => {
      expect(isConnectivityError(fetchError(nativeMessage))).toBe(true);
    },
  );

  // iOS words the error in the user's language (REACT-NATIVE-GM is the same
  // thing happening to downloads), so it is known by how it is wrapped and
  // not by what it says.
  test("the iOS wording is recognised in any language", () => {
    expect(
      isConnectivityError(
        fetchError(
          "UnexpectedException: La connessione a Internet sembra essere disattivata. (at ExpoModulesCore/Promise.swift:56)",
        ),
      ),
    ).toBe(true);
    // The line the wrapper sits on moves with the version of Expo.
    expect(
      isConnectivityError(
        fetchError(
          "UnexpectedException: Zeitüberschreitung bei der Anforderung. (at ExpoModulesCore/Promise.swift:61)",
        ),
      ),
    ).toBe(true);
  });

  // What the native side rejects with for reasons of its own: these are the
  // app's doing, or Expo's.
  test.each([
    ["Unknown error"],
    [
      "FetchUnknownException: Unknown error (at ExpoFetch/ExpoFetchModule.swift:107)",
    ],
    ["Redirect is not allowed when redirect mode is 'error'"],
    [
      "FetchRedirectException: Redirect is not allowed when redirect mode is 'error' (at ExpoFetch/NativeResponse.swift:195)",
    ],
    ["The Android context has been lost"],
    ["connection lost"],
  ])("a failure that is not the network's is not: %j", (nativeMessage) => {
    expect(isConnectivityError(fetchError(nativeMessage))).toBe(false);
  });

  test("a cancelled request is an abort, not connectivity", () => {
    const cancelled = fetchError(
      "FetchRequestCanceledException: Fetch request has been canceled (at ExpoFetch/NativeResponse.swift:63)",
    );
    expect(isConnectivityError(cancelled)).toBe(false);
    expect(isAbortLikeError(cancelled)).toBe(true);
  });

  // expo/fetch resolves for any status, so a "fetch failed" that names one
  // was thrown by a caller that did get an answer.
  test.each([
    ["fetch failed: 500"],
    ["fetch failed: 502 Bad Gateway"],
    ["fetch failed: HTTP 404"],
    ["fetch failed: status code 403"],
    ["fetch failed with status 500"],
    ["Wikidata responded 500"],
  ])("a failure that carries an HTTP status is not: %j", (message) => {
    expect(isConnectivityError(new Error(message))).toBe(false);
  });

  test("nor is one that carries the status or the response beside the message", () => {
    const nativeMessage =
      "UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)";
    expect(
      isConnectivityError(
        Object.assign(fetchError(nativeMessage), { status: 500 }),
      ),
    ).toBe(false);
    expect(
      isConnectivityError(
        Object.assign(fetchError(nativeMessage), { response: { status: 404 } }),
      ),
    ).toBe(false);
  });

  test("the wording is only known at the start of an Error's message", () => {
    expect(
      isConnectivityError(
        new Error(
          "Saving failed after fetch failed: java.net.SocketException: reset",
        ),
      ),
    ).toBe(false);
    expect(
      isConnectivityError("fetch failed: java.net.SocketException: reset"),
    ).toBe(false);
  });
});

describe("isGatewayStatus", () => {
  test("says the same of a bare status as of an axios error", () => {
    expect(isGatewayStatus(502)).toBe(true);
    expect(isGatewayStatus(530)).toBe(true);
    expect(isGatewayStatus(421)).toBe(true);
    expect(isGatewayStatus(444)).toBe(true);
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

// REACT-NATIVE-2B: 25 users. Cloudflare answers a client that accepts JSON,
// which axios does, with its 1xxx errors as a problem document instead of the
// HTML page: the same refusal, in a shape the HTML check does not see.
describe("isGatewayBlockError — Cloudflare's own error as JSON", () => {
  const CLOUDFLARE_ERRORS =
    "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors";
  // What axios makes of the body the events carried.
  const cloudflareProblem = (code = 1000) => ({
    type: `${CLOUDFLARE_ERRORS}/error-${code}/`,
    title: `Error ${code}: DNS points to prohibited IP`,
    status: 403,
    detail: "The domain's DNS records point to a prohibited IP address.",
  });
  const blocked = (data: unknown, status = 403) =>
    isGatewayBlockError(
      httpError(status, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          server: "cloudflare",
        },
        data,
      }),
    );

  test("a 403 with Cloudflare's problem document is the gateway's refusal", () => {
    expect(blocked(cloudflareProblem())).toBe(true);
    expect(
      isEnvironmentError(httpError(403, { data: cloudflareProblem() })),
    ).toBe(true);
  });

  // 1006 to 1009 are bans by address and country, 1010 and 1020 the zone's
  // own firewall rules: what the HTML page says, when the HTML page is sent.
  test.each([1003, 1006, 1009, 1010, 1020])(
    "error %i is recognised the same way",
    (code) => {
      expect(blocked(cloudflareProblem(code))).toBe(true);
    },
  );

  test("the document is known by its type, with or without the last slash", () => {
    expect(blocked({ type: `${CLOUDFLARE_ERRORS}/error-1000` })).toBe(true);
    expect(blocked({ type: `${CLOUDFLARE_ERRORS}/error-1000/` })).toBe(true);
  });

  // Every 403 of a server behind Cloudflare carries its Server header: the
  // header says who relayed the answer, not who gave it.
  test("a 403 of the server's own that came through Cloudflare is not", () => {
    // Jellyfin: ASP.NET problem details.
    expect(
      blocked({
        type: "https://tools.ietf.org/html/rfc9110#section-15.5.4",
        title: "Forbidden",
        status: 403,
        traceId: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00",
      }),
    ).toBe(false);
    // Seerr.
    expect(
      blocked({
        message: "You do not have permission to access this endpoint",
      }),
    ).toBe(false);
    expect(blocked(undefined)).toBe(false);
    expect(blocked("")).toBe(false);
    expect(blocked("Forbidden")).toBe(false);
  });

  test("a body that only resembles the document is not", () => {
    // The words without the type.
    expect(
      blocked({
        title: "Error 1000: DNS points to prohibited IP",
        status: 403,
      }),
    ).toBe(false);
    // Another page of Cloudflare's documentation.
    expect(
      blocked({
        type: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-520/",
      }),
    ).toBe(false);
    expect(blocked({ type: "https://developers.cloudflare.com/" })).toBe(false);
    // The same path on a host that is not Cloudflare's.
    expect(
      blocked({
        type: "https://example.com/cloudflare-1xxx-errors/error-1000/",
      }),
    ).toBe(false);
    expect(
      blocked({
        type: "https://developers.cloudflare.com.example.com/cloudflare-1xxx-errors/error-1000/",
      }),
    ).toBe(false);
    // A number that is not one of the 1xxx errors.
    expect(blocked({ type: `${CLOUDFLARE_ERRORS}/error-520/` })).toBe(false);
    expect(blocked({ type: `${CLOUDFLARE_ERRORS}/error-10000/` })).toBe(false);
    // A type that is not text.
    expect(blocked({ type: [`${CLOUDFLARE_ERRORS}/error-1000/`] })).toBe(false);
    expect(blocked({ type: 1000 })).toBe(false);
    // A list of documents, or one nested in something else.
    expect(blocked([cloudflareProblem()])).toBe(false);
    expect(blocked({ error: cloudflareProblem() })).toBe(false);
  });

  // Only 403, as for the HTML page: 1015 is Cloudflare's rate limit, sent as
  // a 429, which can be the app asking too often.
  test("the document under another status is still reported", () => {
    expect(blocked(cloudflareProblem(1015), 429)).toBe(false);
    expect(blocked(cloudflareProblem(), 404)).toBe(false);
    expect(blocked(cloudflareProblem(), 500)).toBe(false);
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
  const HOST = "my-private-host.duckdns.org";
  const described = (
    data: unknown,
    contentType?: unknown,
    { status = 500, server }: { status?: number; server?: unknown } = {},
  ) =>
    describeHttpResponse(
      httpError(status, {
        headers: {
          ...(contentType ? { "content-type": contentType } : {}),
          ...(server ? { server } : {}),
        },
        data,
      }),
    );

  // How the 404 on POST /Sessions/Capabilities/Full was traced to Jellyfin's
  // own ExceptionMiddleware and not to a proxy. Whatever else this function
  // gives up, it has to keep saying this.
  test("quotes the reason Jellyfin gives in fixed words, with the Server header", () => {
    expect(
      described("Error processing request.", "text/plain; charset=utf-8", {
        status: 404,
        server: "Kestrel",
      }),
    ).toEqual({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      server: "Kestrel",
      bodyKind: "text",
      bodyLength: 25,
      body: "Error processing request.",
    });
  });

  test("knows the reason with a line break after it", () => {
    expect(described("Error processing request.\n", "text/plain")?.body).toBe(
      "Error processing request.",
    );
  });

  // Text a machine the app knows nothing about wrote. Each of these was sent
  // as it is before, the first 200 characters of it, and none of them holds
  // anything the scrubber recognises.
  describe("plain text it does not know is described, not quoted", () => {
    test.each([
      // http-proxy-middleware, when it cannot reach its target
      `Error occurred while trying to proxy: ${HOST}/Sessions/Capabilities/Full`,
      "no healthy upstream for jellyfin.lan:8096",
      "dial tcp [2001:db8::5]:8096: connect: connection refused",
      // Jellyfin in development mode sends the exception message
      "Could not find a part of the path '/media/Movies/Inception (2010)'.",
      "User fredrik not found",
      "Session not found.",
    ])("%s", (text) => {
      expect(described(text, "text/plain", { server: "nginx" })).toEqual({
        status: 500,
        contentType: "text/plain",
        server: "nginx",
        bodyKind: "text",
        bodyLength: text.length,
      });
    });

    test("under no content type at all", () => {
      expect(described(`upstream ${HOST} timed out`)).toEqual({
        status: 500,
        bodyKind: "text",
        bodyLength: 46,
      });
    });

    test("markup that is not an HTML document", () => {
      const fragment = `<head><title>${HOST}</title></head>`;
      expect(described(fragment, "text/plain")).toEqual({
        status: 500,
        contentType: "text/plain",
        bodyKind: "text",
        bodyLength: fragment.length,
      });
    });
  });

  describe("a JSON body is described by its field names", () => {
    test("ASP.NET problem details", () => {
      expect(
        described(
          {
            type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
            title: "One or more validation errors occurred.",
            status: 400,
            errors: { "$.PlayableMediaTypes": ["The value 'x' is not valid."] },
            traceId: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
          },
          "application/problem+json; charset=utf-8",
          { status: 400, server: "Kestrel" },
        ),
      ).toEqual({
        status: 400,
        contentType: "application/problem+json; charset=utf-8",
        server: "Kestrel",
        bodyKind: "json",
        bodyKeys: ["type", "title", "status", "errors", "traceId"],
        errorFields: ["$.PlayableMediaTypes"],
      });
    });

    // The names under `errors` are the parameters the server rejected. They
    // are only names when they read as one: a server is free to key the
    // object by anything, a host among them.
    test("the rejected parameters are named, and nothing that is not a name", () => {
      const result = described(
        {
          errors: {
            sortBy: ["not valid"],
            "my-host.example.org": ["unreachable"],
            "/media/films": ["missing"],
          },
        },
        "application/problem+json",
      );
      expect(result?.errorFields).toEqual(["sortBy"]);
      expect(JSON.stringify(result)).not.toContain("example.org");
    });

    test("an errors field that is not an object names nothing", () => {
      expect(
        described({ errors: ["my-host.example.org"] }, "application/json")
          ?.errorFields,
      ).toBeUndefined();
    });

    test("a Seerr error", () => {
      expect(
        described(
          { message: "Request for Inception already exists." },
          "application/json",
        ),
      ).toEqual({
        status: 500,
        contentType: "application/json",
        bodyKind: "json",
        bodyKeys: ["message"],
      });
    });

    // Cloudflare answers a client that accepts JSON, which axios does, with
    // problem details of its own, and they carry the zone. Not an HTML page,
    // so isGatewayBlockError does not see it and the failure is reported.
    test("Cloudflare's own problem details name the field, not the zone", () => {
      const result = described(
        {
          type: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1020/",
          title: "Error 1020: Access denied",
          status: 403,
          ray_id: "9d99a4434fz2d168",
          zone: HOST,
          cloudflare_error: true,
        },
        "application/problem+json; charset=utf-8",
        { status: 403, server: "cloudflare" },
      );
      expect(result?.bodyKeys).toEqual([
        "type",
        "title",
        "status",
        "ray_id",
        "zone",
        "cloudflare_error",
      ]);
      expect(JSON.stringify(result)).not.toContain(HOST);
    });

    // A map keyed by something the server chose is data, not a field name.
    test("a key that is not a plain field name is left out", () => {
      expect(
        described(
          {
            [HOST]: "down",
            "192.168.1.5:8096": "down",
            "a b": 1,
            message: "x",
          },
          "application/json",
        )?.bodyKeys,
      ).toEqual(["message"]);
      expect(
        described({ [`k${"x".repeat(40)}`]: 1 }, "application/json")?.bodyKeys,
      ).toEqual([]);
    });

    test("only the first field names are listed", () => {
      const many = Object.fromEntries(
        Array.from({ length: 40 }, (_, i) => [`field${i}`, i]),
      );
      expect(described(many, "application/json")?.bodyKeys).toHaveLength(12);
    });

    test("an array has no field names to give", () => {
      expect(described([{ host: HOST }], "application/json")).toEqual({
        status: 500,
        contentType: "application/json",
        bodyKind: "json",
      });
    });

    // axios leaves a body it could not parse as the text it was.
    test("JSON that arrives as text is text", () => {
      expect(described(`{"zone":"${HOST}"`, "application/json")).toEqual({
        status: 500,
        contentType: "application/json",
        bodyKind: "text",
        bodyLength: 37,
      });
    });
  });

  // A proxy does not always label its page as one, and the content type was
  // all that kept a page out: under text/plain or a JSON type the start of it
  // went onto the event, with the host it names.
  describe("an HTML page", () => {
    const PAGE = `<!DOCTYPE html><html><head><title>${HOST} | 500</title>`;

    test("is told by its content type", () => {
      expect(
        described(`<center>${HOST}</center>`, "text/html", {
          status: 404,
          server: "nginx/1.25",
        }),
      ).toEqual({
        status: 404,
        contentType: "text/html",
        server: "nginx/1.25",
        bodyKind: "html",
        bodyLength: 44,
      });
    });

    test.each([
      "text/plain",
      "text/plain; charset=utf-8",
      "application/json",
      "application/problem+json",
    ])("is told by how it starts when sent as %s", (contentType) => {
      expect(described(PAGE, contentType, { server: "nginx" })).toEqual({
        status: 500,
        contentType,
        server: "nginx",
        bodyKind: "html",
        bodyLength: PAGE.length,
      });
    });

    test("is told behind whitespace or a byte order mark", () => {
      expect(described(`\r\n  ${PAGE}`, "text/plain")?.bodyKind).toBe("html");
      expect(described(`﻿${PAGE}`, "text/plain")?.bodyKind).toBe("html");
    });

    test("is told when it opens with its html tag", () => {
      expect(
        described(`<html><body>${HOST}</body></html>`, "text/plain")?.bodyKind,
      ).toBe("html");
    });
  });

  // The Server header is what the machine that answered calls itself, and an
  // admin can make that anything, the host name included. It went out as it
  // came, and a host with no scheme in front of it passes the scrubber.
  describe("the Server header is cut down to the product it names", () => {
    const serverOf = (server: unknown) =>
      described("", undefined, { server })?.server;

    // The signal that tells Jellyfin from a proxy has to survive the cut.
    test.each([
      ["Kestrel", "Kestrel"],
      ["cloudflare", "cloudflare"],
      ["nginx/1.25.3", "nginx/1.25.3"],
      ["Microsoft-IIS/10.0", "Microsoft-IIS/10.0"],
      ["Apache/2.4.57 (Debian)", "Apache/2.4.57"],
      ["Werkzeug/2.0.1 Python/3.9.2", "Werkzeug/2.0.1"],
      ["Jetty(9.4.z-SNAPSHOT)", "Jetty"],
      ["  nginx  ", "nginx"],
      ["nginx/1.25.3-alpine", "nginx/1.25.3"],
    ])("%s", (server, product) => {
      expect(serverOf(server)).toBe(product);
    });

    test.each([
      HOST,
      `${HOST}:8096`,
      `${HOST}/1.0`,
      `https://${HOST}`,
      "jellyfin.lan",
      "nas:8096",
      "192.168.1.5",
      "[2001:db8::5]:8096",
      "fredrik@nas",
      // No product name runs this long, and a cut of it is still a cut of
      // something nobody vouched for.
      `media-${"x".repeat(40)}`,
    ])("a value that reads as a host is withheld: %s", (server) => {
      const result = described("", undefined, { server });
      expect(result?.server).toBe("[withheld]");
      expect(JSON.stringify(result)).not.toMatch(/duckdns|lan|nas|168|2001/);
    });

    // A version is up to three numbers. Four are an IPv4 address as much as
    // they are a version, and anything else after the slash is free text.
    test.each([
      ["proxy/192.168.1.5", "proxy"],
      ["openresty/1.21.4.1", "openresty"],
      [`proxy/1.${HOST}`, "proxy"],
      [`proxy/${HOST}`, "proxy"],
      ["proxy/1234567", "proxy"],
      // A colon or a slash after the numbers means they were the start of an
      // address, a port or a path, and a cut of one is not a version.
      ["proxy/2001:db8::5", "proxy"],
      ["proxy/192.168.1/24", "proxy"],
      ["proxy/1.2.3:8096", "proxy"],
    ])("a version that is not one is left off: %s", (server, product) => {
      expect(serverOf(server)).toBe(product);
    });

    test("only the first product is named", () => {
      expect(serverOf(`nginx ${HOST}`)).toBe("nginx");
      expect(serverOf("nginx, Kestrel")).toBe("nginx");
    });

    // Kestrel always names itself, so a Server header that is there and is
    // not repeated still says a proxy answered, where none at all says the
    // proxy strips it. The two used to read the same on an event.
    test("a header that was sent is marked, one that was not is absent", () => {
      expect(serverOf("Node.js")).toBe("[withheld]");
      expect(serverOf("3proxy/0.9")).toBe("[withheld]");
      expect(described("")).toEqual({ status: 500, bodyKind: "empty" });
      expect(described("")).not.toHaveProperty("server", "[withheld]");
      expect(serverOf("   ")).toBeUndefined();
    });

    // axios types a header as a string or a list of them, and a header sent
    // twice can arrive as either. A list reads as its entries in order, so a
    // host in front is withheld and one behind a product is never reached.
    test.each<[unknown, string | undefined]>([
      [["nginx", "Kestrel"], "nginx"],
      [["nginx", HOST], "nginx"],
      [[HOST, "nginx"], "[withheld]"],
      [[HOST], "[withheld]"],
      [[], undefined],
      [[""], undefined],
      [8096, "[withheld]"],
      [{ host: HOST }, "[withheld]"],
    ])("a value that is not a string: %j", (server, expected) => {
      const result = described("", undefined, { server });
      expect(result?.server).toBe(expected);
      expect(JSON.stringify(result)).not.toContain("duckdns");
    });
  });

  describe("the content type is cut down to the media type and its charset", () => {
    const contentTypeOf = (contentType: unknown) =>
      described("", contentType)?.contentType;

    test.each([
      ["text/plain", "text/plain"],
      ["text/plain; charset=utf-8", "text/plain; charset=utf-8"],
      ['text/html;charset="UTF-8"', "text/html; charset=utf-8"],
      [
        "Application/Problem+JSON; Charset=UTF-8",
        "application/problem+json; charset=utf-8",
      ],
      ["application/octet-stream", "application/octet-stream"],
      ["text/html; charset=ISO-8859-1", "text/html; charset=iso-8859-1"],
    ])("%s", (contentType, expected) => {
      expect(contentTypeOf(contentType)).toBe(expected);
    });

    test.each([
      [`multipart/form-data; boundary=${HOST}`, "multipart/form-data"],
      [
        `application/json; profile="https://${HOST}/schema"; charset=utf-8`,
        "application/json; charset=utf-8",
      ],
      [`text/plain; charset=${HOST}`, "text/plain"],
      [
        `text/plain; charset=utf-8; server=${HOST}`,
        "text/plain; charset=utf-8",
      ],
    ])("no other parameter is repeated: %s", (contentType, expected) => {
      expect(contentTypeOf(contentType)).toBe(expected);
    });

    // A charset is one of a few known words. Any other plain word is as free
    // as a boundary, and "charset=" can also turn up inside another
    // parameter's quoted value or behind a second media type.
    test.each([
      ["text/plain; charset=fredriks-nas", "text/plain"],
      ['text/plain; profile="x; charset=fredriks-nas"', "text/plain"],
      ["text/plain, text/html; charset=fredriks-nas", "text/plain"],
    ])(
      "a charset that is not a known one is left off: %s",
      (contentType, expected) => {
        expect(contentTypeOf(contentType)).toBe(expected);
      },
    );

    // A dotted subtype is how a vendor type is written and also how a host
    // is, so neither goes out.
    test.each([
      HOST,
      `text/${HOST}`,
      `${HOST}/json`,
      "application/vnd.api+json",
      "not a content type",
    ])(
      "a value that is not a plain media type is withheld: %s",
      (contentType) => {
        const result = described("", contentType);
        expect(result?.contentType).toBe("[withheld]");
        expect(JSON.stringify(result)).not.toContain("duckdns");
      },
    );

    // The body is still read against what the server sent, not the cut.
    test("an HTML page is told under a content type that is withheld", () => {
      expect(described("<center>x</center>", `text/html/${HOST}`)).toEqual({
        status: 500,
        contentType: "[withheld]",
        bodyKind: "html",
        bodyLength: 18,
      });
    });

    // The same list a Server header can arrive as, and the body is read
    // against it too.
    test.each<[unknown, string | undefined]>([
      [["text/html", "application/json"], "text/html"],
      [["text/plain; charset=utf-8"], "text/plain; charset=utf-8"],
      [[HOST, "text/html"], "[withheld]"],
      [[], undefined],
      [404, "[withheld]"],
    ])("a value that is not a string: %j", (contentType, expected) => {
      const result = described("", contentType);
      expect(result?.contentType).toBe(expected);
      expect(JSON.stringify(result)).not.toContain("duckdns");
    });

    test("an HTML page is told by a content type that came as a list", () => {
      expect(
        described("<center>x</center>", ["text/html; charset=utf-8"])?.bodyKind,
      ).toBe("html");
    });
  });

  // Jellyfin refuses with a status and nothing else.
  test("an empty body is said to be empty", () => {
    for (const data of [undefined, null, ""]) {
      expect(described(data, undefined, { status: 403 })).toEqual({
        status: 403,
        bodyKind: "empty",
      });
    }
  });

  test("a body that is neither text nor JSON is only said to be there", () => {
    expect(described(new ArrayBuffer(8), "application/octet-stream")).toEqual({
      status: 500,
      contentType: "application/octet-stream",
      bodyKind: "other",
    });
    expect(described(42, "application/json")?.bodyKind).toBe("other");
  });

  // The sweep behind all of the above: nothing of a body is repeated unless
  // it is one of the reasons listed by name.
  test("no body leaves anything of itself but a known reason", () => {
    const secret = `${HOST} Inception fredrik`;
    for (const data of [
      secret,
      `<html>${secret}`,
      { message: secret, [secret]: secret },
      [secret],
    ]) {
      for (const contentType of [
        undefined,
        "text/plain",
        "text/html",
        "application/json",
        "application/problem+json",
      ]) {
        const out = JSON.stringify(described(data, contentType));
        expect(out).not.toMatch(/duckdns|Inception|fredrik/);
      }
    }
  });

  test("is undefined without a response", () => {
    expect(describeHttpResponse(httpError(undefined))).toBeUndefined();
    expect(describeHttpResponse(new Error("boom"))).toBeUndefined();
  });
});
