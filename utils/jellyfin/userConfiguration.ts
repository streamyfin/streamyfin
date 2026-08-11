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
 * Only fields present in `update` are emitted in the payload. Omitted keys
 * are left out so spreading the payload onto `user.Configuration` preserves
 * existing server values — avoiding wiping preferences if an edit occurs
 * before local seeding completes.
 *
 * An explicit `null` language (the picker's "None" row) is mapped to `""`
 * to clear the preference on the server.
 */
export function buildUserConfigurationPayload(
  update: Partial<Settings>,
): Partial<UserConfiguration> {
  const payload: Partial<UserConfiguration> = {};

  if (update?.subtitleMode !== undefined) {
    payload.SubtitleMode = update.subtitleMode;
  }
  if (update?.playDefaultAudioTrack !== undefined) {
    payload.PlayDefaultAudioTrack = update.playDefaultAudioTrack;
  }
  if (update?.rememberAudioSelections !== undefined) {
    payload.RememberAudioSelections = update.rememberAudioSelections;
  }
  if (update?.rememberSubtitleSelections !== undefined) {
    payload.RememberSubtitleSelections = update.rememberSubtitleSelections;
  }

  if (update?.defaultAudioLanguage !== undefined) {
    payload.AudioLanguagePreference =
      update.defaultAudioLanguage === null
        ? ""
        : (update.defaultAudioLanguage?.ThreeLetterISOLanguageName ?? "");
  }

  if (update?.defaultSubtitleLanguage !== undefined) {
    payload.SubtitleLanguagePreference =
      update.defaultSubtitleLanguage === null
        ? ""
        : (update.defaultSubtitleLanguage?.ThreeLetterISOLanguageName ?? "");
  }

  return payload;
}
