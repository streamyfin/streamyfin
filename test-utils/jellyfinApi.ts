import { Jellyfin } from "@jellyfin/sdk";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";

const matchesSubset = (expected: unknown, actual: unknown): boolean => {
  if (expected === null || typeof expected !== "object") {
    return expected === actual;
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.every((element, index) => matchesSubset(element, actual[index]))
    );
  }
  return Object.entries(expected).every(([key, value]) =>
    matchesSubset(
      value,
      (actual as Record<string, unknown> | undefined)?.[key],
    ),
  );
};

/**
 * Asymmetric body matcher for axios-mock-adapter: matches a request whose
 * JSON body contains the given subset (bun's `expect.objectContaining` is
 * not callable from outside `expect`, so it cannot be used here).
 */
export const bodyContaining = (subset: Record<string, unknown>) => ({
  asymmetricMatch: (actual: unknown) => matchesSubset(subset, actual),
});

/**
 * Creates a real SDK `Api` instance whose axios instance is stubbed with
 * axios-mock-adapter, so specs exercise the actual SDK request pipeline
 * without network access.
 *
 * Declare request stubs on `api.mock`
 * (https://github.com/ctimmerm/axios-mock-adapter):
 *
 *   api.mock.onPost(url, bodyContaining({...})).reply(200, response);
 *   api.mock.history.post // requests that were sent
 *
 * A request matching no stub throws. `makeApi(response)` instead answers
 * every request with `response`.
 */
export const makeApi = (...cannedResponse: [] | [unknown]) => {
  const axiosInstance = axios.create();
  const mock = new MockAdapter(axiosInstance, { onNoMatch: "throwException" });
  if (cannedResponse.length === 1) {
    mock.onAny().reply(200, cannedResponse[0]);
  }

  const api = new Jellyfin({
    clientInfo: { name: "streamyfin-tests", version: "0.0.0" },
    deviceInfo: { name: "test-device", id: "device-1" },
  }).createApi("https://jellyfin.example.com", "SECRET_TOKEN", axiosInstance);

  return Object.assign(api, { mock });
};
