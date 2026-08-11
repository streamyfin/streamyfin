/**
 * Mapping between Streamyfin's local settings and the Jellyfin user profile.
 *
 * Types-only imports so the mapping is unit-testable: the hook that uses it
 * pulls in the Jellyfin SDK, react-query and jotai, which is more than a test
 * runner can load.
 */
import type { UserConfiguration } from "@jellyfin/sdk/lib/generated-client/models";
import type { Settings } from "@/utils/atoms/settings";

/**
 * Translate a Streamyfin settings patch into a Jellyfin user-configuration
 * patch.
 *
 * Every write sends all six mirrored fields, so a key absent from `update`
 * falls back to the user's current value rather than being cleared. The one
 * exception is an explicit `null` language — the picker's "None" row — which
 * must be sent as `""`; letting it fall through would make "no preference"
 * impossible to express.
 */
export function buildUserConfigurationPayload(
  update: Partial<Settings>,
  settings: Settings | null,
): Partial<UserConfiguration> {
  const payload: Partial<UserConfiguration> = {
    SubtitleMode: update?.subtitleMode ?? settings?.subtitleMode,
    PlayDefaultAudioTrack:
      update?.playDefaultAudioTrack ?? settings?.playDefaultAudioTrack,
    // `??` not `||`: turning a remember toggle off must survive the round trip.
    RememberAudioSelections:
      update?.rememberAudioSelections ?? settings?.rememberAudioSelections,
    RememberSubtitleSelections:
      update?.rememberSubtitleSelections ??
      settings?.rememberSubtitleSelections,
  };

  payload.AudioLanguagePreference =
    update?.defaultAudioLanguage === null
      ? ""
      : update?.defaultAudioLanguage?.ThreeLetterISOLanguageName ||
        settings?.defaultAudioLanguage?.ThreeLetterISOLanguageName ||
        "";

  payload.SubtitleLanguagePreference =
    update?.defaultSubtitleLanguage === null
      ? ""
      : update?.defaultSubtitleLanguage?.ThreeLetterISOLanguageName ||
        settings?.defaultSubtitleLanguage?.ThreeLetterISOLanguageName ||
        "";

  return payload;
}
