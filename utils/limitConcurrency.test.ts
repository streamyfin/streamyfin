import { createLimiter } from "./limitConcurrency";

/** A promise whose settling the test decides. */
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("createLimiter", () => {
  it("runs no more than the limit at once", async () => {
    const limit = createLimiter(3);
    const gates = Array.from({ length: 5 }, deferred);
    let started = 0;
    const runs = gates.map((gate) =>
      limit(() => {
        started++;
        return gate.promise;
      }),
    );

    await flush();
    expect(started).toBe(3);

    gates[0].resolve();
    await flush();
    expect(started).toBe(4);

    for (const gate of gates) gate.resolve();
    await Promise.all(runs);
    expect(started).toBe(5);
  });

  // Closing the sheet aborts the checks still waiting; none may reach the server after.
  it("never starts a queued task whose signal aborted", async () => {
    const limit = createLimiter(1);
    const first = deferred();
    limit(() => first.promise);
    const controller = new AbortController();
    const queuedTask = jest.fn(() => Promise.resolve());

    const queued = limit(queuedTask, controller.signal);
    controller.abort();

    await expect(queued).rejects.toBeDefined();
    first.resolve();
    await flush();
    expect(queuedTask).not.toHaveBeenCalled();
  });

  it("frees the slot when a task fails", async () => {
    const limit = createLimiter(1);
    const failing = limit(() => Promise.reject(new Error("500")));
    const next = jest.fn(() => Promise.resolve("ok"));

    await expect(failing).rejects.toThrow("500");
    await expect(limit(next)).resolves.toBe("ok");
  });
});
