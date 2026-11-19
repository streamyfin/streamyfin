import { act, renderHook } from "@testing-library/react-native";
import { DOWNLOAD_STALL_AFTER_MS } from "@/constants/Downloads";
import type { JobStatus } from "@/providers/Downloads/types";
import { useDownloadStalled } from "./useDownloadStalled";

const job = (overrides: Partial<JobStatus>) =>
  ({ status: "downloading", ...overrides }) as JobStatus;

describe("useDownloadStalled", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const pass = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });

  it("stays quiet while progress keeps arriving", async () => {
    const { result, rerender } = await renderHook<
      boolean,
      { process: JobStatus }
    >(({ process }) => useDownloadStalled(process), {
      initialProps: { process: job({ lastProgressUpdateTime: new Date() }) },
    });

    await pass(DOWNLOAD_STALL_AFTER_MS - 1);
    await rerender({ process: job({ lastProgressUpdateTime: new Date() }) });
    await pass(DOWNLOAD_STALL_AFTER_MS - 1);

    expect(result.current).toBe(false);
  });

  it("reports a stall once no progress has arrived for the threshold", async () => {
    // No event means no render either, so the timer is what has to notice.
    const process = job({ lastProgressUpdateTime: new Date() });
    const { result } = await renderHook(() => useDownloadStalled(process));

    await pass(DOWNLOAD_STALL_AFTER_MS - 1);
    expect(result.current).toBe(false);

    await pass(1);
    expect(result.current).toBe(true);
  });

  it("clears the stall on the next progress event", async () => {
    const stalledSince = new Date();
    const { result, rerender } = await renderHook<
      boolean,
      { process: JobStatus }
    >(({ process }) => useDownloadStalled(process), {
      initialProps: {
        process: job({ lastProgressUpdateTime: stalledSince }),
      },
    });

    await pass(DOWNLOAD_STALL_AFTER_MS);
    expect(result.current).toBe(true);

    await rerender({ process: job({ lastProgressUpdateTime: new Date() }) });

    expect(result.current).toBe(false);
  });

  it("ignores a download that has not reported any progress yet", async () => {
    const process = job({});
    const { result } = await renderHook(() => useDownloadStalled(process));

    await pass(DOWNLOAD_STALL_AFTER_MS * 2);

    expect(result.current).toBe(false);
  });

  it("does not call a queued download stalled", async () => {
    const queued = job({
      status: "queued",
      lastProgressUpdateTime: new Date(),
    });
    const { result } = await renderHook(() => useDownloadStalled(queued));

    await pass(DOWNLOAD_STALL_AFTER_MS * 2);

    expect(result.current).toBe(false);
  });
});
