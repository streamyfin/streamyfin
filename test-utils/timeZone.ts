/**
 * Jest's global setup: the whole suite runs in New York's time zone, west of
 * UTC, on every machine and in CI alike. A test cannot set it for itself:
 * Jest hands each test a copy of process.env, so a test's TZ never reaches
 * the clock, and a date bug that only shows west of UTC went unseen on a UTC
 * runner and east of it.
 */
export default () => {
  process.env.TZ = "America/New_York";
};
