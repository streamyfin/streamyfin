import type { Jellyfin } from "@jellyfin/sdk";
import { clearMmkv } from "@/test-utils/mmkv";
import {
  endSessionOnServerAfter,
  sessionEndsSettled,
} from "@/utils/jellyfin/endSession";
import {
  addServerToList,
  updateServerLocalConfig,
} from "@/utils/secureCredentials";

// An end that never gets to run: only the wait for it is under test.
const endPendingOn = (serverUrl: string) =>
  endSessionOnServerAfter(new Promise(() => {}), {
    jellyfin: {} as Jellyfin,
    serverUrl,
    token: "token",
  });

const stateOf = (promise: Promise<void>) =>
  Promise.race([
    promise.then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 10)),
  ]);

beforeEach(() => {
  clearMmkv();
});

describe("sessionEndsSettled", () => {
  it("counts an address spelled with its default port or in capitals as the same server", async () => {
    endPendingOn("https://media.example:443/jellyfin/");

    expect(
      await stateOf(sessionEndsSettled("HTTPS://Media.Example/jellyfin")),
    ).toBe("pending");
  });

  it("keeps another port and another path apart", async () => {
    endPendingOn("http://media.example:8096");

    expect(await stateOf(sessionEndsSettled("http://media.example:8920"))).toBe(
      "settled",
    );
    expect(
      await stateOf(sessionEndsSettled("http://media.example:8096/other")),
    ).toBe("settled");
  });

  // The user can pick the local address as a server of its own while an end
  // through it is on its way: it is then listed before the server it is the
  // local address of.
  it.each([
    ["the local address", "http://10.0.0.5:8096"],
    ["the address it is saved under", "https://home.example"],
  ])(
    "finds an end through %s once that one is saved on its own",
    async (_case, endedOn) => {
      addServerToList("https://home.example");
      updateServerLocalConfig("https://home.example", {
        localUrl: "http://10.0.0.5:8096",
        homeWifiSSIDs: [],
        enabled: true,
      });
      let release = () => {};
      endSessionOnServerAfter(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
        { jellyfin: {} as Jellyfin, serverUrl: endedOn, token: "token" },
      );
      try {
        addServerToList("http://10.0.0.5:8096");

        expect(await stateOf(sessionEndsSettled("http://10.0.0.5:8096"))).toBe(
          "pending",
        );
        expect(await stateOf(sessionEndsSettled("https://home.example"))).toBe(
          "pending",
        );
      } finally {
        release();
      }
      // Free again under both once it ran, so the next case holds only its own.
      expect(await stateOf(sessionEndsSettled("http://10.0.0.5:8096"))).toBe(
        "settled",
      );
      expect(await stateOf(sessionEndsSettled("https://home.example"))).toBe(
        "settled",
      );
    },
  );
});
