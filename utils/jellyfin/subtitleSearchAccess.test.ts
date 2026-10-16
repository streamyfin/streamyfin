import type { UserDto, UserPolicy } from "@jellyfin/sdk/lib/generated-client";
import {
  canSearchServerSubtitles,
  SubtitleSearchNotAllowedError,
  subtitleSearchErrorMessage,
} from "./subtitleSearchAccess";

const t = (key: string) => key;

// Only the two fields the rule reads; the server sends the whole policy.
const userWith = (policy: Partial<UserPolicy>): UserDto => ({
  Policy: policy as UserPolicy,
});

describe("canSearchServerSubtitles", () => {
  test("an administrator may, whatever the permission says", () => {
    expect(
      canSearchServerSubtitles(
        userWith({ IsAdministrator: true, EnableSubtitleManagement: false }),
      ),
    ).toBe(true);
  });

  test("a user with the subtitle management permission may", () => {
    expect(
      canSearchServerSubtitles(
        userWith({ IsAdministrator: false, EnableSubtitleManagement: true }),
      ),
    ).toBe(true);
  });

  // REACT-NATIVE-7M: the permission is off by default, and the search was
  // offered and sent anyway, to come back as a 403.
  test("a user without it may not", () => {
    expect(
      canSearchServerSubtitles(
        userWith({ IsAdministrator: false, EnableSubtitleManagement: false }),
      ),
    ).toBe(false);
    expect(canSearchServerSubtitles(userWith({}))).toBe(false);
  });

  test("an unknown policy is left to the server", () => {
    expect(canSearchServerSubtitles(null)).toBe(true);
    expect(canSearchServerSubtitles({})).toBe(true);
  });
});

describe("subtitleSearchErrorMessage", () => {
  test("a refusal is named as one, with or without a client-side key", () => {
    for (const hasKey of [true, false]) {
      expect(
        subtitleSearchErrorMessage(
          new SubtitleSearchNotAllowedError(),
          hasKey,
          t,
        ),
      ).toBe("player.subtitle_search_not_allowed");
    }
  });

  test("a server failure without a client-side key points at the provider", () => {
    expect(subtitleSearchErrorMessage(new Error("500"), false, t)).toBe(
      "player.no_subtitle_provider",
    );
  });

  test("with a client-side key the error speaks for itself", () => {
    expect(subtitleSearchErrorMessage(new Error("quota"), true, t)).toBe(
      "quota",
    );
    expect(subtitleSearchErrorMessage("offline", true, t)).toBe("offline");
  });
});
