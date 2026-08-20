import { describe, expect, test } from "bun:test";
import { AxiosError, type AxiosResponse } from "axios";
import {
  describeHttpError,
  describeHttpResponse,
  isConnectivityError,
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
    expect(described?.body).toStartWith('{"title":"Not Found"');
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
