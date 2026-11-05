import {
  NO_REMOTE_TARGET,
  type RemoteTargetState,
} from "@/modules/mpv-player/src/cast/Cast.types";
import { resolvePlay, waitForTarget } from "./playTarget";

const salon = {
  kind: "cast" as const,
  id: "device-a",
  name: "Salon",
  capabilities: { volume: true },
};
const connected: RemoteTargetState = {
  ...NO_REMOTE_TARGET,
  state: "connected",
  target: salon,
};
const connecting: RemoteTargetState = {
  ...NO_REMOTE_TARGET,
  state: "connecting",
  target: salon,
};

/** A listener the test drives, as onRemoteTargetChanged would. */
const listening = () => {
  const listeners: ((state: RemoteTargetState) => void)[] = [];
  const remove = jest.fn();
  return {
    listen: (listener: (state: RemoteTargetState) => void) => {
      listeners.push(listener);
      return { remove };
    },
    emit: (state: RemoteTargetState) => {
      for (const listener of listeners) listener(state);
    },
    remove,
  };
};

test("aConnectedTargetGetsThePlay", () => {
  expect(
    resolvePlay({ target: connected, offline: false, longPress: false }),
  ).toEqual({ where: "target", name: "Salon" });
});

test("aLongPressOffersPlayHere", () => {
  expect(
    resolvePlay({ target: connected, offline: false, longPress: true }),
  ).toEqual({ where: "here" });
});

test("aDownloadPlaysHereAndSaysWhy", () => {
  expect(
    resolvePlay({ target: connected, offline: true, longPress: false }),
  ).toEqual({ where: "here", reason: "download" });
});

test("aPressWhileConnectingWaitsForTheTarget", () => {
  expect(
    resolvePlay({ target: connecting, offline: false, longPress: false }),
  ).toEqual({ where: "waitForTarget", name: "Salon" });
});

test("withNoTargetThePlayStaysHere", () => {
  expect(
    resolvePlay({ target: NO_REMOTE_TARGET, offline: false, longPress: false }),
  ).toEqual({ where: "here" });
  // A session on its way out takes no more play.
  expect(
    resolvePlay({
      target: { ...connected, state: "ending" },
      offline: false,
      longPress: false,
    }),
  ).toEqual({ where: "here" });
});

test("aConnectionThatSucceedsLetsThePlayGo", async () => {
  const bus = listening();
  const wait = waitForTarget(() => connecting, bus.listen);
  bus.emit(connected);
  await expect(wait).resolves.toEqual(connected);
  expect(bus.remove).toHaveBeenCalled();
});

// The wait ends with the state that ended it, so the button plays nothing and shows why.
test("aFailedConnectionPlaysNothingAndSaysWhy", async () => {
  const bus = listening();
  const failed: RemoteTargetState = {
    ...NO_REMOTE_TARGET,
    error: "Cast error 2155",
    errorCode: 2155,
    failedTarget: salon,
  };
  const wait = waitForTarget(() => connecting, bus.listen);
  bus.emit(failed);
  await expect(wait).resolves.toEqual(failed);
});

// The connection can land between the press and the wait's first read.
test("aTargetConnectedBeforeTheWaitResolvesAtOnce", async () => {
  const bus = listening();
  await expect(waitForTarget(() => connected, bus.listen)).resolves.toEqual(
    connected,
  );
  expect(bus.remove).toHaveBeenCalled();
});

// A connection that never lands ends the wait: the press does not stay pending for good.
test("aWaitGivesUpAfterItsLimit", async () => {
  jest.useFakeTimers();
  try {
    const bus = listening();
    const wait = waitForTarget(() => connecting, bus.listen, {
      timeoutMs: 1_000,
    });
    jest.advanceTimersByTime(1_000);
    await expect(wait).resolves.toBe("timeout");
    expect(bus.remove).toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

// The button that waited went away: the wait ends and hears nothing more.
test("anAbortedWaitEndsWithoutAState", async () => {
  const bus = listening();
  const abort = new AbortController();
  const wait = waitForTarget(() => connecting, bus.listen, {
    signal: abort.signal,
  });
  abort.abort();
  bus.emit(connected);
  await expect(wait).resolves.toBe("aborted");
  expect(bus.remove).toHaveBeenCalled();
});

// Cancel from the sheet goes through ending: the wait ends with the end, not on its way there.
test("aCancelledConnectionWaitsOutItsEnd", async () => {
  const bus = listening();
  let result: unknown;
  const wait = waitForTarget(() => connecting, bus.listen).then((settled) => {
    result = settled;
    return settled;
  });
  bus.emit({ ...connecting, state: "ending" });
  await Promise.resolve();
  const whileEnding = result;
  bus.emit(NO_REMOTE_TARGET);
  await expect(wait).resolves.toEqual(NO_REMOTE_TARGET);
  expect(whileEnding).toBeUndefined();
});
