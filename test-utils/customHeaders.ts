import { afterEach, mock } from "bun:test";
import { atom } from "jotai";
import {
  normalizeCustomHeaders,
  usableCustomHeaders,
} from "@/utils/customHeaders/normalize";
import {
  hasHeaders,
  optionsWithOptionalHeaders,
  sourceWithOptionalHeaders,
} from "@/utils/customHeaders/optionalHeaders";
import { HEADER_PRESETS, presetRows } from "@/utils/customHeaders/presets";
import {
  isUrlForBaseUrl,
  normalizeHttpBaseUrl,
} from "@/utils/customHeaders/urlMatching";

let jellyfinHeaders: Record<string, string> = {};
let configuredFor: string | undefined;

/**
 * Sets the proxy auth headers the stub reports. Call it from a spec's
 * `beforeEach`, not once at load: `mock.module` re-links every importer, so the
 * last registration to run decides what a value captured at registration would
 * be, and file order is not ours to choose.
 *
 * Pass `serverUrl` to pin the headers to one server, so a spec can prove that
 * production looks them up under the key it claims to. Left out, any server
 * gets them.
 */
export const setJellyfinHeaders = (
  headers: Record<string, string> = {},
  serverUrl?: string,
) => {
  jellyfinHeaders = headers;
  configuredFor = serverUrl;
};

const configuredForServer = (serverUrl?: string | null): boolean =>
  configuredFor === undefined ||
  (!!serverUrl &&
    normalizeHttpBaseUrl(serverUrl) === normalizeHttpBaseUrl(configuredFor));

/**
 * The custom-header barrel re-exports modules with native dependencies (MMKV,
 * SecureStore), which `bun:test` cannot load, so specs replace it with the real
 * pure helpers plus stubbed resolvers.
 *
 * Shared rather than written per spec for the same reason as `stubReactNative`:
 * `mock.module` is global and re-links every importer, so all of them have to
 * publish the same export surface. A stub missing one name breaks whichever
 * file links after it, and CI orders the files differently than a local run
 * does, so the break shows up there and not here. That is why the list below
 * is the barrel's, not the four names the first spec happened to need — the
 * pure modules are re-exported for real, and only what touches the native side
 * is stubbed.
 */
export const stubCustomHeaders = () => {
  // Registered here rather than left to each spec to remember: the state above
  // is module level and outlives a file, so one spec that forgets its reset
  // hands its credentials to whichever file bun links next.
  afterEach(() => setJellyfinHeaders());

  mock.module("@/utils/customHeaders", () => ({
    // Pure, so the specs exercise the real thing.
    normalizeCustomHeaders,
    usableCustomHeaders,
    hasHeaders,
    optionsWithOptionalHeaders,
    sourceWithOptionalHeaders,
    HEADER_PRESETS,
    presetRows,
    isUrlForBaseUrl,
    normalizeHttpBaseUrl,

    // Read through the binding rather than captured: a spec sets what it needs
    // in beforeEach, so a later registration cannot decide it retroactively.
    getJellyfinHeaders: (serverUrl?: string | null) =>
      configuredForServer(serverUrl) ? jellyfinHeaders : {},
    // Keeps the real gate: this function exists so a poster or stream hosted
    // off-server never receives the proxy credentials, and a stub that answers
    // for every URL would let a spec assert that leak away.
    getJellyfinHeadersForUrl: (
      url?: string | null,
      serverUrl?: string | null,
    ) => {
      if (!url || !serverUrl || !isUrlForBaseUrl(url, serverUrl)) {
        return undefined;
      }
      const headers = configuredForServer(serverUrl) ? jellyfinHeaders : {};
      return Object.keys(headers).length > 0 ? headers : undefined;
    },
    getHeadersForUrl: () => undefined,
    getIntegrationHeaders: () => ({}),
    getIntegrationHeaderConfig: () => undefined,
    updateIntegrationHeaderConfig: () => {},
    resolveIntegrationHeaders: () => ({}),
    INTEGRATION_CONFIG_KEY_PREFIX: "custom_headers_config_",

    customHeadersVersionAtom: atom(0),
    bumpCustomHeadersVersion: () => {},
    deleteSecureCustomHeaderValues: async () => {},
    isStoredCustomHeader: () => false,
    resolveCustomHeaderValues: () => [],
    secureCustomHeaderMetadata: () => [],
  }));
};
