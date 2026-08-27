import { mock } from "bun:test";
import { normalizeCustomHeaders } from "@/utils/customHeaders/normalize";
import { optionsWithOptionalHeaders } from "@/utils/customHeaders/optionalHeaders";

let jellyfinHeaders: Record<string, string> = {};

/**
 * Sets the proxy auth headers the stub reports. Call it from a spec's
 * `beforeEach`, not once at load: `mock.module` re-links every importer, so the
 * last registration to run decides what a value captured at registration would
 * be, and file order is not ours to choose.
 */
export const setJellyfinHeaders = (headers: Record<string, string> = {}) => {
  jellyfinHeaders = headers;
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
export const stubCustomHeaders = () =>
  mock.module("@/utils/customHeaders", () => ({
    normalizeCustomHeaders,
    optionsWithOptionalHeaders,
    // Read through the binding rather than captured: a spec sets what it needs
    // in beforeEach, so a later registration cannot decide it retroactively.
    getJellyfinHeaders: () => jellyfinHeaders,
    getJellyfinHeadersForUrl: () =>
      Object.keys(jellyfinHeaders).length ? jellyfinHeaders : undefined,
  }));
