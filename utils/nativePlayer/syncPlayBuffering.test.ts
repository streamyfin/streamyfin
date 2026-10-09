import { NativeSyncPlayBufferingReporter } from "./syncPlayBuffering";

describe("native SyncPlay buffering", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("short catch-up seeks do not pause the group", () => {
    const report = jest.fn();
    const reporter = new NativeSyncPlayBufferingReporter(report);
    reporter.update(true, true);
    jest.advanceTimersByTime(50);
    reporter.update(false, true);
    jest.advanceTimersByTime(500);
    expect(report.mock.calls).toEqual([[false]]);
  });

  test("a sustained decoder stall enters the barrier and recovery exits it", () => {
    const report = jest.fn();
    const reporter = new NativeSyncPlayBufferingReporter(report);
    reporter.update(true, true);
    jest.advanceTimersByTime(249);
    expect(report).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(report.mock.calls).toEqual([[true]]);
    reporter.update(false, true);
    expect(report.mock.calls).toEqual([[true], [false]]);
  });

  test("an unloaded replacement immediately blocks coordinated playback", () => {
    const report = jest.fn();
    const reporter = new NativeSyncPlayBufferingReporter(report);
    reporter.update(true, false);
    expect(report.mock.calls).toEqual([[true]]);
  });

  test("replacement or dismissal cancels the outgoing decoder's timer", () => {
    const report = jest.fn();
    const reporter = new NativeSyncPlayBufferingReporter(report);
    reporter.update(true, true);
    jest.advanceTimersByTime(100);
    reporter.reset();
    jest.advanceTimersByTime(500);
    expect(report).not.toHaveBeenCalled();
  });
});
