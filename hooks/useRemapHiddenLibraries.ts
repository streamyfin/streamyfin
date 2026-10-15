import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import { isEqual } from "lodash";
import { useEffect } from "react";
import { HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY } from "@/constants/Values";
import { settingsAtom, useSettings } from "@/utils/atoms/settings";
import {
  type HiddenViewOrigins,
  remapHiddenLibraries,
} from "@/utils/library/hiddenLibraries";
import { storage } from "@/utils/mmkv";

/**
 * Keeps the hidden Live TV, Collections and Playlists views hidden across the
 * one time Jellyfin 12 changes their ids. See remapHiddenLibraries.
 */
export function useRemapHiddenLibraries(
  views: BaseItemDto[] | null | undefined,
  userId: string | null | undefined,
) {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const hidden = settings.hiddenLibraries;
  // Until settings load the list reads as its default, and a locked list is
  // the admin's: either way the write below would not land, and the carried
  // over origin would be gone with nothing hidden in its place.
  const writable =
    useAtomValue(settingsAtom) !== null &&
    pluginSettings?.hiddenLibraries?.locked !== true;

  useEffect(() => {
    // An empty answer says nothing about which views exist.
    if (!writable || !userId || !views?.length) return;

    const current = hidden ?? [];
    const knownOrigins =
      storage.get<HiddenViewOrigins>(HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY) ?? {};
    const result = remapHiddenLibraries(current, knownOrigins, views, userId);

    // The hidden list first: should the origins fail to save, the next run
    // finds the new id hidden already and only consumes them again.
    if (!isEqual(result.hidden, current)) {
      updateSettings({ hiddenLibraries: result.hidden });
    }
    if (!isEqual(result.origins, knownOrigins)) {
      storage.setAny(HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY, result.origins);
    }
  }, [views, userId, hidden, writable]);
}
