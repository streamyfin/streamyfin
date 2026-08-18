/**
 * Shared in-memory stand-in for @/utils/log.
 *
 * The real module reaches Sentry, which pulls in react-native, whose Flow-typed
 * entry point bun cannot parse — so any suite that loads it transitively dies
 * with "Unexpected typeof" rather than a test failure.
 *
 * It covers the module's full export surface on purpose: `mock.module` is
 * process-wide in bun, so a partial mock registered here removes names that
 * OTHER suites' modules import, and which of them breaks depends on load order.
 */
export const logMock = () => ({
  writeToLog: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  logAndCaptureError: () => undefined,
  readFromLog: () => [],
});
