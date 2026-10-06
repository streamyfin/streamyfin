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
 * What the resolvers answer on a locked phone, where the Keychain refuses the
 * stored values. Pass it to `setJellyfinHeaders` to put a spec there.
 */
export const unreadableHeaders: Record<string, string> = Object.freeze({});

/**
 * Sets the proxy auth headers the double reports. Call it from a spec's
 * `beforeEach`, so every test starts from the headers it declares.
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
 * SecureStore), so specs replace it with the real pure helpers plus stubbed
 * resolvers. Wire it at the top of a spec, where Jest hoists it above the
 * imports:
 *
 *   jest.mock("@/utils/customHeaders", () =>
 *     jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
 *   );
 *
 * The list below is the barrel's whole surface, not the few names the first
 * spec happened to need: the pure modules are re-exported for real, and only
 * what touches the native side is stubbed, so a module under test never meets
 * a missing export.
 */
export const customHeadersModule = () => ({
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

  // Read through the binding rather than captured, so what a spec sets in
  // beforeEach applies to the test that follows.
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
  headersUnreadable: (headers: Record<string, string>) =>
    headers === unreadableHeaders,
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
});
