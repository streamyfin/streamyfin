import { describe, expect, spyOn, test } from "bun:test";
import { makeApi } from "@/test-utils/jellyfinApi";
import { waitForEventOnce } from "../EventEmitter";
import { TimeSync } from "./TimeSync";

describe("SDK server time measurements", () => {
  test("keeps the NTP offset, delay and integer ping calculations", async () => {
    const api = makeApi({
      RequestReceptionTime: new Date(1105).toISOString(),
      ResponseTransmissionTime: new Date(1115).toISOString(),
    });
    const clock = new TimeSync(api);
    const now = spyOn(Date, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValue(1020);
    try {
      const update = waitForEventOnce(clock, "update", 3000);
      clock.startPing();
      expect(await update).toEqual([100, 5]);
      expect(clock.remoteDateToLocal(new Date(2000)).getTime()).toBe(1900);
      expect(clock.localDateToRemote(new Date(2000)).getTime()).toBe(2100);
      expect(api.mock.history.get).toHaveLength(1);
    } finally {
      clock.destroy();
      now.mockRestore();
    }
  });
});
