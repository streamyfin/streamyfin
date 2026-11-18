import type { Jellyfin } from "@jellyfin/sdk";
import {
  endSessionOnServerAfter,
  sessionEndsSettled,
} from "@/utils/jellyfin/endSession";

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
});
