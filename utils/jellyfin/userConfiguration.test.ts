import { describe, expect, test } from "bun:test";

import { buildUserConfigurationPayload } from "@/utils/jellyfin/userConfiguration";

const culture = (code: string) =>
  ({ ThreeLetterISOLanguageName: code }) as never;

describe("buildUserConfigurationPayload", () => {
  test("carries an updated language through", () => {
    const payload = buildUserConfigurationPayload({
      defaultSubtitleLanguage: culture("ger"),
    });
    expect(payload.SubtitleLanguagePreference).toBe("ger");
    expect(payload.AudioLanguagePreference).toBeUndefined();
  });

  test("only emits keys present in update", () => {
    // Only keys in update are sent, so spreading onto user.Configuration keeps
    // existing server preferences intact (e.g. before local seeding completes).
    const payload = buildUserConfigurationPayload({
      subtitleMode: "None" as never,
    });
    expect(payload.SubtitleMode).toBe("None");
    expect(payload.AudioLanguagePreference).toBeUndefined();
    expect(payload.SubtitleLanguagePreference).toBeUndefined();
    expect(payload.RememberAudioSelections).toBeUndefined();
  });

  test("clears a language when it is explicitly set to null", () => {
    // "No preference" is the picker's first row. It arrives as null and must be
    // sent as "" — undefined would omit it from payload and keep the old value.
    const payload = buildUserConfigurationPayload({
      defaultSubtitleLanguage: null,
    });
    expect(payload.SubtitleLanguagePreference).toBe("");
    expect(payload.AudioLanguagePreference).toBeUndefined();
  });

  test("preserves an explicit false rather than treating it as unset", () => {
    const payload = buildUserConfigurationPayload({
      rememberAudioSelections: false,
    });
    expect(payload.RememberAudioSelections).toBe(false);
    expect(payload.RememberSubtitleSelections).toBeUndefined();
  });

  test("emits an empty payload when update is empty or contains no mirrored keys", () => {
    const emptyPayload = buildUserConfigurationPayload({});
    expect(emptyPayload).toEqual({});

    const unmirroredPayload = buildUserConfigurationPayload({
      preferedLanguage: "en",
    } as never);
    expect(unmirroredPayload).toEqual({});
  });
});
