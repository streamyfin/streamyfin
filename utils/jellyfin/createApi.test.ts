import { describe, expect, test } from "bun:test";
import { Jellyfin } from "@jellyfin/sdk";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api/system-api";
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  setJellyfinHeaders,
  stubCustomHeaders,
} from "@/test-utils/customHeaders";

stubCustomHeaders();

const { createApiWithCustomHeaders } = await import("./createApi");

const SERVER = "https://jellyfin.example";

/**
 * The real SDK, not a double: the argument this wrapper cares about is the
 * third one of `Jellyfin.createApi(basePath, accessToken?, axiosInstance?)`,
 * and a fake that hard-codes that position would keep passing after an SDK bump
 * moved it — while `Api` quietly fell back to `axiosInstance = globalAxios` and
 * put every interceptor back on the shared instance.
 */
const jellyfin = () =>
  new Jellyfin({
    clientInfo: { name: "streamyfin-tests", version: "0.0.0" },
    deviceInfo: { name: "test-device", id: "device-1" },
  });

/**
 * How many *live* request interceptors sit on an instance, which axios does not
 * expose. `eject` nulls its slot in place rather than splicing, so the raw
 * length would count interceptors that have already been removed.
 */
const requestInterceptorCount = (instance: AxiosInstance): number =>
  (
    instance.interceptors.request as unknown as { handlers: unknown[] }
  ).handlers.filter(Boolean).length;

/** Answers every request without a network, and keeps what was about to be sent. */
const captureRequests = (instance: AxiosInstance) => {
  const sent: InternalAxiosRequestConfig[] = [];
  instance.defaults.adapter = async (config) => {
    sent.push(config);
    return { data: null, status: 200, statusText: "OK", headers: {}, config };
  };
  return sent;
};

/** The headers one request went out with. */
const headersOf = async (
  url: string,
  config?: { baseURL?: string },
  serverUrl = SERVER,
) => {
  setJellyfinHeaders({ "cf-access-client-id": "abc" }, serverUrl);
  const api = createApiWithCustomHeaders(jellyfin(), serverUrl);
  const sent = captureRequests(api.axiosInstance);

  await api.axiosInstance.get(url, config);

  expect(sent).toHaveLength(1);
  return sent[0].headers;
};

describe("createApiWithCustomHeaders", () => {
  test("gives each api an axios instance of its own", () => {
    // Everything attached to the global instance would otherwise watch every
    // bare axios call in the app: a 401 from a third-party integration reached
    // the session-expiry interceptor and signed the user out of Jellyfin. And
    // because the header interceptor is never ejected, a shared instance
    // collected another one on every login and every server switch.
    const sdk = jellyfin();

    const first = createApiWithCustomHeaders(sdk, "https://one.example");
    const second = createApiWithCustomHeaders(sdk, "https://two.example");

    expect(first.axiosInstance).not.toBe(axios);
    expect(first.axiosInstance).not.toBe(second.axiosInstance);
  });

  test("adds nothing to the global instance", () => {
    const before = requestInterceptorCount(axios);

    createApiWithCustomHeaders(jellyfin(), SERVER);
    createApiWithCustomHeaders(jellyfin(), SERVER);

    expect(requestInterceptorCount(axios)).toBe(before);
  });

  test("attaches the configured proxy auth headers", async () => {
    // The whole reason this wrapper exists. Moving off the global instance must
    // not cost a Cloudflare Access or Pangolin user their headers.
    //
    // Driven through a real SDK operation rather than a hand-written url: the
    // SDK prepends `basePath` when the instance has no `baseURL`, so every
    // request it makes is absolute, and a spec that asks for a relative path
    // returns before the guard it means to be covering.
    setJellyfinHeaders({ "cf-access-client-id": "abc" }, SERVER);
    const api = createApiWithCustomHeaders(jellyfin(), SERVER);
    const sent = captureRequests(api.axiosInstance);

    await getSystemApi(api).getPublicSystemInfo();

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`${SERVER}/System/Info/Public`);
    expect(sent[0].headers.get("cf-access-client-id")).toBe("abc");
  });

  test("looks the headers up under the server it was created for", async () => {
    // Headers are saved per server, so passing the wrong key here returns none
    // at all — which reads to the user as the gateway rejecting every request.
    setJellyfinHeaders(
      { "cf-access-client-id": "abc" },
      "https://other.example",
    );
    const api = createApiWithCustomHeaders(jellyfin(), SERVER);
    const sent = captureRequests(api.axiosInstance);

    // Absolute, so the guard lets it through and what is left under test is the
    // lookup key rather than the destination check.
    await api.axiosInstance.get(`${SERVER}/System/Info/Public`);

    expect(sent[0].headers.get("cf-access-client-id")).toBeUndefined();
  });

  test("does not send them to a url it cannot place", async () => {
    // Relative with no base: nothing says where this lands, and an
    // unverifiable destination does not get the credentials.
    const headers = await headersOf("/System/Info/Public");

    expect(headers.get("cf-access-client-id")).toBeUndefined();
  });

  test("does not send the headers to a third-party host", async () => {
    // The sessions screen used this instance for a geo-IP lookup, so Cloudflare
    // Access credentials went to freeipapi.com on every visit for over a year.
    const headers = await headersOf("https://freeipapi.com/api/json/1.2.3.4");

    expect(headers.get("cf-access-client-id")).toBeUndefined();
  });

  test("does not send them to a third-party base url either", async () => {
    // Being relative is not what makes a request safe: the base it resolves
    // against is per request, so a caller can point one anywhere.
    const headers = await headersOf("/api/json/1.2.3.4", {
      baseURL: "https://freeipapi.com",
    });

    expect(headers.get("cf-access-client-id")).toBeUndefined();
  });

  test("still sends them to an absolute url on the server", async () => {
    // Guarding absolute URLs must not cost the callers that build a full URL
    // against the server themselves.
    const headers = await headersOf(`${SERVER}/Items/1/Images/Primary`);

    expect(headers.get("cf-access-client-id")).toBe("abc");
  });

  test("still sends them to a relative url on the server's base", async () => {
    const headers = await headersOf("/Items/1/Images/Primary", {
      baseURL: SERVER,
    });

    expect(headers.get("cf-access-client-id")).toBe("abc");
  });
});
