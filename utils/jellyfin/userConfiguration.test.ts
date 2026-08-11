import { describe, expect, test } from "bun:test";
import type { Settings } from "@/utils/atoms/settings";

import { buildUserConfigurationPayload } from "@/utils/jellyfin/userConfiguration";

const culture = (code: string) =>
  ({ ThreeLetterISOLanguageName: code }) as never;

const settings = {
  subtitleMode: "Smart",
  playDefaultAudioTrack: true,
  rememberAudioSelections: true,
  rememberSubtitleSelections: true,
  defaultAudioLanguage: culture("eng"),
  defaultSubtitleLanguage: culture("swe"),
} as unknown as Settings;

describe("buildUserConfigurationPayload", () => {
  test("carries an updated language through", () => {
    const payload = buildUserConfigurationPayload(
      { defaultSubtitleLanguage: culture("ger") },
      settings,
    );
    expect(payload.SubtitleLanguagePreference).toBe("ger");
  });

  test("keeps the current value for keys not being updated", () => {
    // Every write sends all six fields, so an omitted key must fall back to what
    // the user already has — not to empty, which would clear it server-side.
    const payload = buildUserConfigurationPayload(
      { subtitleMode: "None" as never },
      settings,
    );
    expect(payload.AudioLanguagePreference).toBe("eng");
    expect(payload.SubtitleLanguagePreference).toBe("swe");
    expect(payload.RememberAudioSelections).toBe(true);
  });

  test("clears a language when it is explicitly set to null", () => {
    // "No preference" is the picker's first row. It arrives as null and must be
    // sent as "" — undefined would fall through to the current value and make
    // the choice impossible to express.
    const payload = buildUserConfigurationPayload(
      { defaultSubtitleLanguage: null },
      settings,
    );
    expect(payload.SubtitleLanguagePreference).toBe("");
    expect(payload.AudioLanguagePreference).toBe("eng");
  });

  test("preserves an explicit false rather than treating it as unset", () => {
    // `??` not `||`: turning a remember toggle off must survive the round trip.
    const payload = buildUserConfigurationPayload(
      { rememberAudioSelections: false },
      settings,
    );
    expect(payload.RememberAudioSelections).toBe(false);
    expect(payload.RememberSubtitleSelections).toBe(true);
  });

  test("sends empty strings when nothing is set anywhere", () => {
    const payload = buildUserConfigurationPayload({}, {} as Settings);
    expect(payload.AudioLanguagePreference).toBe("");
    expect(payload.SubtitleLanguagePreference).toBe("");
  });

  test("tolerates a null settings object", () => {
    const payload = buildUserConfigurationPayload(
      { defaultAudioLanguage: culture("jpn") },
      null,
    );
    expect(payload.AudioLanguagePreference).toBe("jpn");
    expect(payload.SubtitleLanguagePreference).toBe("");
  });
});
