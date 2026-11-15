/**
 * `@sentry/react-native` for every unit spec, wired in `unitSetup.ts`. The
 * package ships no Jest mock, so Jest's automock stands in: every export is a
 * `jest.fn()`, and a spec asserts a report with
 * `jest.mocked(Sentry.captureException)`. Two exports are given their
 * behaviour back, because callers depend on it: `withScope` runs its callback
 * with `sentryScope`, or the reporting inside it would never run, and `wrap`
 * returns the component it wraps.
 */
export const sentryScope = {
  setContext: jest.fn(),
  setFingerprint: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
  setLevel: jest.fn(),
};

export const sentryModule = () => {
  const sentry = jest.createMockFromModule<
    typeof import("@sentry/react-native")
  >("@sentry/react-native");
  jest
    .mocked(sentry.withScope)
    .mockImplementation(((run: (scope: unknown) => unknown) =>
      run(sentryScope)) as never);
  jest
    .mocked(sentry.wrap)
    .mockImplementation(((component: unknown) => component) as never);
  return sentry;
};
