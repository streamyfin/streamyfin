import { deferToMicrotask } from "@/utils/deferToMicrotask";

// The TV option and subtitle sheets close first and apply the choice through
// this, on the same timing InteractionManager.runAfterInteractions gave them.
describe("deferToMicrotask", () => {
  test("runs the task once the caller has returned, not during the call", async () => {
    const order: string[] = [];
    deferToMicrotask(() => order.push("task"));
    order.push("caller");

    await Promise.resolve();
    expect(order).toEqual(["caller", "task"]);
  });

  test("runs the task before a timer that was queued first", async () => {
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 0);
    deferToMicrotask(() => order.push("task"));

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(order).toEqual(["task", "timer"]);
  });

  // Not what the runAfterInteractions stub did: it rethrew the error from a
  // timer, which the global handler treats as fatal. A rejection nobody awaits
  // is reported as unhandled instead, a warning rather than a crash.
  test("rejects the returned promise when the task throws", async () => {
    const error = new Error("apply failed");
    let pending: Promise<void> | undefined;
    expect(() => {
      pending = deferToMicrotask(() => {
        throw error;
      });
    }).not.toThrow();

    await expect(pending).rejects.toBe(error);
  });
});
