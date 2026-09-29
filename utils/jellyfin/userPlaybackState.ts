import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  PlaybackProgressInfo,
  UserItemDataDto,
} from "@jellyfin/sdk/lib/generated-client";
import { getSessionApi, getUserDataApi } from "@jellyfin/sdk/lib/utils/api";

/** Mutable playback state, excluding the server-owned identity key. */
type UserDataUpdates = Partial<Omit<UserItemDataDto, "Key">>;
/** Persisted data from older SDKs may omit the server key. */
type LegacyUserData = Partial<UserItemDataDto> | null | undefined;

/** Merges playback/favorite changes without inventing a key or losing legacy offline progress. */
export function updateExistingUserData(
  userData: BaseItemDto["UserData"],
  updates: UserDataUpdates,
): BaseItemDto["UserData"];
export function updateExistingUserData(
  userData: LegacyUserData,
  updates: UserDataUpdates,
): LegacyUserData;
export function updateExistingUserData(
  userData: LegacyUserData,
  updates: UserDataUpdates,
): LegacyUserData {
  if (!userData) return userData;
  return { ...userData, ...updates };
}

/** Restores only a missing key from the server, leaving local playback fields authoritative. */
export function restoreUserDataKey(
  userData: BaseItemDto["UserData"],
  serverUserData: BaseItemDto["UserData"],
): BaseItemDto["UserData"];
export function restoreUserDataKey(
  userData: LegacyUserData,
  serverUserData: BaseItemDto["UserData"],
): LegacyUserData;
export function restoreUserDataKey(
  userData: LegacyUserData,
  serverUserData: BaseItemDto["UserData"],
): LegacyUserData {
  if (
    typeof userData?.Key === "string" ||
    typeof serverUserData?.Key !== "string"
  ) {
    return userData;
  }
  return userData ? { ...userData, Key: serverUserData.Key } : serverUserData;
}

/** Toggles favorites through UserDataApi, propagating failures for optimistic rollback. */
export const setItemFavorite = async (
  api: Api,
  itemId: string,
  userId: string,
  isFavorite: boolean,
) => {
  const userDataApi = getUserDataApi(api);
  const request = { itemId, userId };
  const response = isFavorite
    ? await userDataApi.markFavoriteItem(request)
    : await userDataApi.unmarkFavoriteItem(request);
  return response.data;
};

/** Sets played state through UserDataApi without swallowing server failures. */
export const setItemPlayed = async (
  api: Api,
  itemId: string,
  userId: string | undefined,
  played: boolean,
) => {
  const userDataApi = getUserDataApi(api);
  const request = { itemId, userId };
  const response = played
    ? await userDataApi.markPlayedItem(request)
    : await userDataApi.markUnplayedItem(request);
  return response.data;
};

/** Reports progress through SessionApi; the caller decides how to handle offline failures. */
export const reportItemPlaybackProgress = (
  api: Api,
  playbackProgressInfo: PlaybackProgressInfo,
) => getSessionApi(api).reportPlaybackProgress({ playbackProgressInfo });
