import { mock } from "bun:test";
import { normalizeCustomHeaders } from "@/utils/customHeaders/normalize";
import { optionsWithOptionalHeaders } from "@/utils/customHeaders/optionalHeaders";

type Overrides = {
  /** Proxy auth headers configured for the Jellyfin server, if any. */
  jellyfinHeaders?: Record<string, string>;
};

/**
 * The custom-header barrel re-exports modules with native dependencies (MMKV,
 * SecureStore), which `bun:test` cannot load, so specs replace it with the real
 * pure helpers plus stubbed resolvers.
 *
 * Shared rather than written per spec for the same reason as `stubReactNative`:
 * `mock.module` is global and re-links every importer, so all of them have to
 * publish the same export surface. A stub missing one name breaks whichever
 * file links after it, and CI orders the files differently than a local run
 * does, so the break shows up there and not here.
 */
export const stubCustomHeaders = (overrides: Overrides = {}) =>
  mock.module("@/utils/customHeaders", () => ({
    normalizeCustomHeaders,
    optionsWithOptionalHeaders,
    getJellyfinHeaders: () => overrides.jellyfinHeaders ?? {},
    getJellyfinHeadersForUrl: () =>
      overrides.jellyfinHeaders && Object.keys(overrides.jellyfinHeaders).length
        ? overrides.jellyfinHeaders
        : undefined,
  }));
