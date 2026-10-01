import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { SYNC_PLAY_TUNING } from "@/constants/SyncPlay";
import { controlledTimers } from "@/test-utils/controlledTimers";
import { createBufferingDebouncer } from "./bufferingDebouncer";

const adapters: ReturnType<typeof createBufferingDebouncer>[] = [];
let clock: ReturnType<typeof controlledTimers>;
beforeEach(() => {
  clock = controlledTimers();
});
const makeAdapter = () => {
  const emit = mock((_buffering: boolean) => {});
  const adapter = createBufferingDebouncer(emit);
  adapters.push(adapter);
  return { ...adapter, emit };
};
const sleep = (ms: number) => clock.advance(ms);

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.dispose();
  clock.restore();
});

describe("native waiting/playing event adaptation", () => {
  test("short seeks suppress waiting but preserve each ready event needed by the handshake", () => {
    const adapter = makeAdapter();
    adapter.notify(false);
    adapter.notify(true);
    adapter.notify(false);
    adapter.notify(true);
    adapter.notify(false);
    expect(adapter.emit.mock.calls).toEqual([[false], [false], [false]]);
  });

  test("duplicate native snapshots are not duplicate ready events", () => {
    const adapter = makeAdapter();
    adapter.notify(false);
    adapter.notify(false);
    adapter.notify(true);
    adapter.notify(true);
    adapter.notify(false);
    adapter.notify(false);
    expect(adapter.emit.mock.calls).toEqual([[false], [false]]);
  });

  test(
    "sustained waiting fires after three seconds and teardown cancels old-session callbacks",
    async () => {
      const active = makeAdapter();
      const detached = makeAdapter();
      active.notify(true);
      detached.notify(true);
      detached.dispose();
      await sleep(SYNC_PLAY_TUNING.minBufferingThresholdMs / 2);
      expect(active.emit).not.toHaveBeenCalled();
      active.notify(true);
      await sleep(SYNC_PLAY_TUNING.minBufferingThresholdMs / 2 + 30);
      expect(active.emit.mock.calls).toEqual([[true]]);
      expect(detached.emit).not.toHaveBeenCalled();
      active.notify(false);
      expect(active.emit.mock.calls).toEqual([[true], [false]]);
    },
    SYNC_PLAY_TUNING.minBufferingThresholdMs + 2000,
  );
});
