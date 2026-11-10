import { REMOTE_VOLUME_STEP_SETTLE_MS } from "@/constants/Playback";
import { createVolumeStepper } from "./volumeStepper";

describe("createVolumeStepper", () => {
  const setup = (volume: number) => {
    const read = jest.fn(async () => volume);
    const write = jest.fn();
    const stepper = createVolumeStepper(read, write);
    return { read, write, step: stepper.step, set: stepper.set };
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // A step that comes in before the previous one landed would read the same
  // volume and ask for the same target, losing a step.
  test("starts a step from the target of the one still landing", async () => {
    const { read, write, step } = setup(0.4);

    await Promise.all([step(0.1), step(0.1), step(-0.05)]);

    expect(read).toHaveBeenCalledTimes(1);
    expect(write.mock.calls.map(([volume]) => volume.toFixed(2))).toEqual([
      "0.50",
      "0.60",
      "0.55",
    ]);
  });

  // The volume can have moved by other means in between, the keys for one.
  test("reads the volume again once the steps have settled", async () => {
    const { read, step } = setup(0.4);

    await step(0.1);
    jest.advanceTimersByTime(REMOTE_VOLUME_STEP_SETTLE_MS);
    await step(0.1);

    expect(read).toHaveBeenCalledTimes(2);
  });

  // SetVolume writes an absolute volume between steps: the next step must
  // start from it, not from the target of the step before.
  test("starts a step from an absolute volume set in between", async () => {
    const { read, write, step, set } = setup(0.4);

    await step(0.1);
    set(0.2);
    await step(0.1);

    expect(read).toHaveBeenCalledTimes(1);
    expect(write.mock.calls.map(([volume]) => volume.toFixed(2))).toEqual([
      "0.50",
      "0.20",
      "0.30",
    ]);
  });

  // The read can take seconds on iOS: a SetVolume that lands meanwhile is the
  // newer command, and the step that was waiting must not undo it.
  test("lets an absolute volume set while a step waits for its read win", async () => {
    let resolveRead: (volume: number) => void = () => {};
    const read = jest.fn(
      () => new Promise<number>((resolve) => (resolveRead = resolve)),
    );
    const write = jest.fn();
    const { step, set } = createVolumeStepper(read, write);

    const waiting = step(0.1);
    set(0.2);
    resolveRead(0.4);
    await waiting;
    await step(0.1);

    expect(write.mock.calls.map(([volume]) => volume.toFixed(2))).toEqual([
      "0.20",
      "0.30",
    ]);
  });

  test("keeps the volume between 0 and 1", async () => {
    const { write, step } = setup(0.95);

    await step(0.1);
    jest.advanceTimersByTime(REMOTE_VOLUME_STEP_SETTLE_MS);

    expect(write).toHaveBeenLastCalledWith(1);
  });
});
