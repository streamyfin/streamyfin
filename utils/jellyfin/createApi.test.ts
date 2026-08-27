import { beforeEach, describe, expect, test } from "bun:test";
import type { Api, Jellyfin } from "@jellyfin/sdk";
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  setJellyfinHeaders,
  stubCustomHeaders,
} from "@/test-utils/customHeaders";

stubCustomHeaders();
beforeEach(() => setJellyfinHeaders({ "cf-access-client-id": "abc" }));

const { createApiWithCustomHeaders } = await import("./createApi");

/**
 * Stands in for the SDK, which falls back to the global axios instance when it
 * is handed none:
 *
 *   constructor(basePath, clientInfo, deviceInfo, accessToken = '',
 *               axiosInstance = globalAxios)
 */
const fakeJellyfin = (): Jellyfin =>
  ({
    createApi: (basePath: string, _token?: string, instance?: AxiosInstance) =>
      ({
        basePath,
        axiosInstance: instance ?? axios,
      }) as Api,
  }) as unknown as Jellyfin;

/** How many request interceptors sit on an instance, which axios does not expose. */
const requestInterceptorCount = (instance: AxiosInstance): number =>
  (instance.interceptors.request as unknown as { handlers: unknown[] }).handlers
    .length;

/** Answers every request without a network, and keeps what was about to be sent. */
const captureRequests = (instance: AxiosInstance) => {
  const sent: InternalAxiosRequestConfig[] = [];
  instance.defaults.adapter = async (config) => {
    sent.push(config);
    return { data: null, status: 200, statusText: "OK", headers: {}, config };
  };
  return sent;
};

describe("createApiWithCustomHeaders", () => {
  test("does not put the Jellyfin api on the global axios instance", () => {
    // Everything attached to that instance would otherwise watch every bare
    // axios call in the app: a 401 from a third-party integration reached the
    // session-expiry interceptor and signed the user out of Jellyfin.
    const api = createApiWithCustomHeaders(
      fakeJellyfin(),
      "https://jellyfin.example",
    );

    expect(api.axiosInstance).not.toBe(axios);
  });

  test("gives each api its own instance rather than sharing one", () => {
    // Neither interceptor is ever ejected, and this runs again on every login
    // and every server switch, so a shared instance collected another pair
    // each time.
    const jellyfin = fakeJellyfin();

    const first = createApiWithCustomHeaders(jellyfin, "https://one.example");
    const second = createApiWithCustomHeaders(jellyfin, "https://two.example");

    expect(first.axiosInstance).not.toBe(second.axiosInstance);
  });

  test("still attaches the configured proxy auth headers", async () => {
    // The whole reason this wrapper exists. Moving off the global instance
    // must not cost a Cloudflare Access or Pangolin user their headers.
    const api = createApiWithCustomHeaders(
      fakeJellyfin(),
      "https://jellyfin.example",
    );
    const sent = captureRequests(api.axiosInstance);

    await api.axiosInstance.get("https://jellyfin.example/System/Info/Public");

    expect(sent).toHaveLength(1);
    expect(sent[0].headers.get("cf-access-client-id")).toBe("abc");
  });

  test("adds nothing to the global instance", () => {
    // The header interceptor used to land on the instance every bare axios call
    // in the app goes through, so a Streamystats request carried the
    // credentials of the Jellyfin gateway, and a login piled on another one.
    const before = requestInterceptorCount(axios);

    createApiWithCustomHeaders(fakeJellyfin(), "https://jellyfin.example");
    createApiWithCustomHeaders(fakeJellyfin(), "https://jellyfin.example");

    expect(requestInterceptorCount(axios)).toBe(before);
  });
});
