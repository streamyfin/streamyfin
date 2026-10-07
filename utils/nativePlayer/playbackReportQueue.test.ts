import { NativePlaybackReportQueue } from "./playbackReportQueue";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe("NativePlaybackReportQueue", () => {
  test("a seek landing while playing cannot overtake its immediately following pause", async () => {
    const queue = new NativePlaybackReportQueue();
    const session = {};
    const landing = deferred();
    const received: { position: number; paused: boolean }[] = [];
    const playing = queue.enqueue(
      session,
      "progress",
      { position: 72.291, paused: false },
      async (info) => {
        await landing.promise;
        received.push(info);
      },
    );
    const paused = queue.enqueue(
      session,
      "progress",
      { position: 72.291, paused: true },
      async (info) => {
        received.push(info);
      },
    );
    await Promise.resolve();
    expect(received).toEqual([]);
    landing.resolve();
    await Promise.all([playing, paused]);
    expect(received).toEqual([
      { position: 72.291, paused: false },
      { position: 72.291, paused: true },
    ]);
  });

  test("old Stop and final position complete before a newly presented session starts", async () => {
    const queue = new NativePlaybackReportQueue();
    const oldSession = {};
    const newSession = {};
    const inFlight = deferred();
    const received: string[] = [];
    const active = queue.enqueue(oldSession, "start", {}, async () => {
      await inFlight.promise;
      received.push("old-start");
    });
    const stale = queue.enqueue(oldSession, "progress", {}, async () => {
      received.push("stale-progress");
    });
    const final = queue.enqueue(oldSession, "final-progress", {}, async () => {
      received.push("final-position");
    });
    const stop = queue.enqueue(oldSession, "stop", {}, async () => {
      received.push("old-stop");
    });
    const next = queue.enqueue(newSession, "start", {}, async () => {
      received.push("new-start");
    });
    inFlight.resolve();
    await Promise.all([active, stale, final, stop, next]);
    expect(received).toEqual([
      "old-start",
      "final-position",
      "old-stop",
      "new-start",
    ]);
  });

  test("a closed session cannot send late progress after its Stop", async () => {
    const queue = new NativePlaybackReportQueue();
    const session = {};
    const report = jest.fn(async () => {});
    await queue.enqueue(session, "stop", {}, report);
    await queue.enqueue(session, "progress", {}, report);
    expect(report).toHaveBeenCalledTimes(1);
  });

  test("ticks stuck behind a hung request collapse into the newest one", async () => {
    const queue = new NativePlaybackReportQueue();
    const session = {};
    const hung = deferred();
    const received: number[] = [];
    const send = async (info: { position: number }) => {
      received.push(info.position);
    };
    const first = queue.enqueue(
      session,
      "progress",
      { position: 10 },
      () => hung.promise,
    );
    const stale = [20, 30].map((position) =>
      queue.enqueue(session, "progress", { position }, send),
    );
    const newest = queue.enqueue(session, "progress", { position: 40 }, send);
    hung.resolve();
    await Promise.all([first, ...stale, newest]);
    expect(received).toEqual([40]);
  });

  test("a tick is not dropped in favour of another session's tick", async () => {
    const queue = new NativePlaybackReportQueue();
    const hung = deferred();
    const received: string[] = [];
    const first = queue.enqueue({}, "start", {}, () => hung.promise);
    const reports = ["a", "b"].map((name) =>
      queue.enqueue({}, "progress", { name }, async (info) => {
        received.push(info.name);
      }),
    );
    hung.resolve();
    await Promise.all([first, ...reports]);
    expect(received).toEqual(["a", "b"]);
  });

  test("HTTP rejection does not block a later pause", async () => {
    const queue = new NativePlaybackReportQueue();
    const session = {};
    const failed = deferred();
    const first = queue.enqueue(session, "progress", {}, () => failed.promise);
    const caught = expect(first).rejects.toThrow("offline");
    const pause = jest.fn(async () => {});
    const next = queue.enqueue(session, "progress", {}, pause);
    failed.reject(new Error("offline"));
    await caught;
    await next;
    expect(pause).toHaveBeenCalledTimes(1);
  });

  test("queued reports retain their physical snapshot and original reporter", async () => {
    const queue = new NativePlaybackReportQueue();
    const session = {};
    const pending = deferred();
    const first = queue.enqueue(session, "start", {}, () => pending.promise);
    const original = jest.fn(async (_info: { position: number }) => {});
    const replacement = jest.fn(async (_info: { position: number }) => {});
    const ref = { current: original };
    const info = { position: 72.291 };
    const next = queue.enqueue(session, "progress", info, ref.current);
    // A drift correction and a provider rerender happen before HTTP dispatch.
    info.position = 113;
    ref.current = replacement;
    pending.resolve();
    await Promise.all([first, next]);
    expect(original).toHaveBeenCalledWith({ position: 72.291 });
    expect(replacement).not.toHaveBeenCalled();
  });

  test("a report that never settles does not hold the reports behind it", async () => {
    jest.useFakeTimers();
    try {
      const queue = new NativePlaybackReportQueue(15_000);
      const session = {};
      const received: string[] = [];
      const hung = queue.enqueue(
        session,
        "start",
        {},
        () => new Promise<void>(() => {}),
      );
      const failed = expect(hung).rejects.toThrow("timed out");
      const stop = queue.enqueue(session, "stop", {}, async () => {
        received.push("stop");
      });
      await Promise.resolve();
      expect(received).toEqual([]);
      await jest.advanceTimersByTimeAsync(15_000);
      await stop;
      await failed;
      expect(received).toEqual(["stop"]);
    } finally {
      jest.useRealTimers();
    }
  });
});
