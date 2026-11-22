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

const HOME = "https://home.example";
const LOCAL = "http://10.0.0.5:8096";

// An end that runs once `after` settles, by default never: only the wait for
// it is under test.
const endOn = (serverUrl: string, after = new Promise<void>(() => {})) =>
  endSessionOnServerAfter(after, {
    jellyfin: {} as Jellyfin,
    serverUrl,
    token: "token",
  });

// Whether a sign-in to each address would still wait.
const statesOf = (...addresses: string[]) =>
  Promise.all(
    addresses.map((address) =>
      Promise.race([
        sessionEndsSettled(address).then(() => "settled"),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 10)),
      ]),
    ),
  );

beforeEach(() => {
  clearMmkv();
});

describe("sessionEndsSettled", () => {
  it("counts an address spelled with its default port or in capitals as the same server", async () => {
    endOn("https://media.example:443/jellyfin/");

    expect(await statesOf("HTTPS://Media.Example/jellyfin")).toEqual([
      "pending",
    ]);
  });

  it("keeps another port and another path apart", async () => {
    endOn("http://media.example:8096");

    expect(
      await statesOf(
        "http://media.example:8920",
        "http://media.example:8096/other",
      ),
    ).toEqual(["settled", "settled"]);
  });

  // The user can pick the local address as a server of its own while an end
  // through it is on its way: it is then listed before the server it is the
  // local address of.
  it.each([
    ["the local address", LOCAL],
    ["the address it is saved under", HOME],
  ])(
    "finds an end through %s once that one is saved on its own",
    async (_case, endedOn) => {
      addServerToList(HOME);
      updateServerLocalConfig(HOME, {
        localUrl: LOCAL,
        homeWifiSSIDs: [],
        enabled: true,
      });
      const { promise, resolve: release } = Promise.withResolvers<void>();
      endOn(endedOn, promise);
      try {
        addServerToList(LOCAL);

        expect(await statesOf(LOCAL, HOME)).toEqual(["pending", "pending"]);
      } finally {
        release();
      }
      // Free again under both once it ran, so the next case holds only its own.
      expect(await statesOf(LOCAL, HOME)).toEqual(["settled", "settled"]);
    },
  );
});
