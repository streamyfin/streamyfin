import type { TFunction } from "i18next";
import {
  castNotStartedMessage,
  receiverLoadErrorMessage,
} from "./receiverLoadErrorMessage";

const t = ((key: string) => key) as unknown as TFunction;

describe("receiverLoadErrorMessage", () => {
  test.each([
    ["server_unreachable", "player.chromecast_server_unreachable"],
    ["playback_failed", "player.chromecast_playback_failed"],
    ["rejected", "player.could_not_create_stream_for_chromecast"],
  ] as const)("names a %s error", (error, key) => {
    expect(receiverLoadErrorMessage(t, error)).toBe(key);
  });
});

describe("castNotStartedMessage", () => {
  test("explains a load error the receiver sent back", () => {
    expect(
      castNotStartedMessage(t, {
        status: "failed",
        error: "server_unreachable",
        message: { type: "connectionerror" },
      }),
    ).toBe("player.chromecast_server_unreachable");
  });

  test("says the TV never started when it went quiet", () => {
    expect(castNotStartedMessage(t, { status: "timed_out" })).toBe(
      "player.chromecast_did_not_start",
    );
  });

  test("says nothing for a cast that started or was replaced", () => {
    expect(castNotStartedMessage(t, { status: "loaded" })).toBeNull();
    expect(castNotStartedMessage(t, { status: "superseded" })).toBeNull();
  });
});
