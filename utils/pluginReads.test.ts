import { onlineManager } from "@tanstack/react-query";
import { PLUGIN_READ_RETRIES } from "@/constants/Notifications";
import { isExpectedError } from "@/utils/errors";
import { readPluginRoute, retryPluginRead } from "./pluginReads";

const answered = (status: number) => ({ response: { status } });

describe("a read of one of the plugin's routes", () => {
  afterEach(() => onlineManager.setOnline(true));

  it("is tried again a few times, then given up", () => {
    const tries = [0, 1, 2, 3].map((count) =>
      retryPluginRead(count, new Error("timeout")),
    );

    expect(tries).toEqual([0, 1, 2, 3].map((n) => n < PLUGIN_READ_RETRIES));
  });

  // A plugin without the route will not grow one by being asked again.
  it("is not tried again for a missing route", () => {
    expect(retryPluginRead(0, answered(404))).toBe(false);
  });

  // Offline, a retry waits for the network, and the screen stays blank meanwhile.
  it("is not tried again offline", () => {
    onlineManager.setOnline(false);

    expect(retryPluginRead(0, new Error("Network Error"))).toBe(false);
  });

  it("marks a missing route's 404 as expected, and nothing else", async () => {
    const missing = answered(404);
    const broken = answered(500);

    await expect(readPluginRoute(() => Promise.reject(missing))).rejects.toBe(
      missing,
    );
    await expect(readPluginRoute(() => Promise.reject(broken))).rejects.toBe(
      broken,
    );
    expect(isExpectedError(missing)).toBe(true);
    expect(isExpectedError(broken)).toBe(false);
  });
});
