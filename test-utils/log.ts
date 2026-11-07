/**
 * `@/utils/log` for every unit spec, wired in `unitSetup.ts`. The real module
 * forwards to Sentry, whose client keeps a timer running past the last test,
 * and to the MMKV log store. Each function is a `jest.fn()`, so a spec can
 * assert a call with `jest.mocked(writeErrorLog)`.
 */
export const silentLogModule = {
  writeToLog: jest.fn(),
  writeInfoLog: jest.fn(),
  writeErrorLog: jest.fn(),
  writeDebugLog: jest.fn(),
  logAndCaptureError: jest.fn(),
  readFromLog: jest.fn(() => []),
};
