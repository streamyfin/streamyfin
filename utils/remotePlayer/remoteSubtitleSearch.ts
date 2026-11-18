import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { getLibraryApi, getSubtitleApi } from "@jellyfin/sdk/lib/utils/api";
import { isAxiosError } from "axios";
import type { TFunction } from "i18next";
import type { createStore } from "jotai";
import {
  REMOTE_SUBTITLE_POLL_ATTEMPTS,
  REMOTE_SUBTITLE_POLL_MS,
} from "@/constants/RemotePlayer";
import type { SubtitleSearchResult } from "@/hooks/useRemoteSubtitles";
import {
  type RemoteTarget,
  reloadOnReceiver,
  remotePlayback,
} from "@/modules/mpv-player/src/cast";
import { updateNativePlayerSubtitleSearch } from "@/modules/mpv-player/src/NativePlayerPresentation";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { receiverNameFor } from "@/utils/cast/jellyfinReceiver";
import { describeErrorForLog } from "@/utils/describeErrorForLog";
import {
  SubtitleSearchNotAllowedError,
  subtitleSearchErrorMessage,
} from "@/utils/jellyfin/subtitleSearchAccess";
import { writeErrorLog } from "@/utils/log";
import {
  jellyfinToResult,
  mapSearchResults,
} from "@/utils/subtitles/subtitleSearchResults";
import { mediaSourceOf } from "./buildRemotePlayerConfig";

interface SearchDeps {
  store: Pick<ReturnType<typeof createStore>, "get" | "set">;
  t: () => TFunction;
  target: () => RemoteTarget | null;
}

const subtitleIndexes = (source: MediaSourceInfo | null) =>
  new Set(
    source?.MediaStreams?.filter((s) => s.Type === "Subtitle").map(
      (s) => s.Index,
    ),
  );

/**
 * The remote player's subtitle search: the server searches and downloads (the phone's own lookup adds a file to a
 * local player, which the TV has none of), then the TV plays the item again where it is with the new subtitle.
 * Only the newest search answers; a download whose item the TV no longer plays applies nothing.
 */
export const remoteSubtitleSearch = (deps: SearchDeps) => {
  let searches = 0;
  let shown: { itemId: string; results: SubtitleSearchResult[] } | null = null;

  // A failure over the list still shown, as the local player says it.
  const failed = (message: string) =>
    updateNativePlayerSubtitleSearch({
      status: "results",
      results: mapSearchResults(shown?.results ?? []),
      errorMessage: message,
    });

  const search = async (language: string) => {
    const asked = ++searches;
    const api = deps.store.get(apiAtom);
    const itemId = deps.store.get(remotePlayAtom)?.play.item.Id;
    if (!api || !itemId) {
      await updateNativePlayerSubtitleSearch({ status: "idle", results: [] });
      return;
    }
    try {
      const { data } = await getSubtitleApi(api).searchRemoteSubtitles({
        itemId,
        language,
      });
      if (asked !== searches) return;
      shown = { itemId, results: (data ?? []).map(jellyfinToResult) };
      await updateNativePlayerSubtitleSearch({
        status: "results",
        results: mapSearchResults(shown.results),
      });
    } catch (error) {
      if (asked !== searches) return;
      // The stored policy can be older than the server's.
      const refused = isAxiosError(error) && error.response?.status === 403;
      await updateNativePlayerSubtitleSearch({
        status: "error",
        results: [],
        // No lookup of the phone's here: the server is the only source.
        errorMessage: subtitleSearchErrorMessage(
          refused ? new SubtitleSearchNotAllowedError() : error,
          false,
          deps.t(),
        ),
      });
    }
  };

  /** The item once the server lists a subtitle it did not have, with that subtitle's index; null past the polls. */
  const waitForNewSubtitle = async (
    itemId: string,
    language: string,
    before: Set<number | undefined>,
    mediaSourceId: string | undefined,
  ): Promise<{ item: BaseItemDto; index: number } | null> => {
    for (let attempt = 0; attempt < REMOTE_SUBTITLE_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) =>
        setTimeout(resolve, REMOTE_SUBTITLE_POLL_MS),
      );
      const api = deps.store.get(apiAtom);
      if (!api) return null;
      const item = await getLibraryApi(api)
        .getItem({ itemId, userId: deps.store.get(userAtom)?.Id })
        .then(({ data }) => data)
        .catch(() => null);
      const source = item
        ? mediaSourceOf({ item, positionTicks: 0, mediaSourceId })
        : null;
      const fresh = source?.MediaStreams?.filter(
        (s) => s.Type === "Subtitle" && !before.has(s.Index),
      );
      const match = fresh?.find((s) => s.Language === language) ?? fresh?.[0];
      if (item && match?.Index != null) return { item, index: match.Index };
    }
    return null;
  };

  const download = async (resultId: string) => {
    const result = shown?.results.find((r) => r.id === resultId);
    const held = deps.store.get(remotePlayAtom);
    const api = deps.store.get(apiAtom);
    if (!result || !shown || !api || held?.play.item.Id !== shown.itemId) {
      await updateNativePlayerSubtitleSearch({ status: "idle", results: [] });
      return;
    }
    const { itemId } = shown;
    try {
      await getSubtitleApi(api).downloadRemoteSubtitles({
        itemId,
        subtitleId: result.id,
      });
    } catch (error) {
      writeErrorLog(
        "The server could not download the subtitle",
        describeErrorForLog(error),
      );
      await failed(deps.t()("player.search_failed"));
      return;
    }
    const found = await waitForNewSubtitle(
      itemId,
      result.language,
      subtitleIndexes(mediaSourceOf(held.play)),
      held.play.mediaSourceId,
    );
    if (!found) {
      // Downloaded, but not listed yet: reloading into the old selection would not be a success.
      await failed(deps.t()("player.subtitle_apply_failed"));
      return;
    }
    // The TV moved on, or the screen closed, while the server saved the file.
    const now = deps.store.get(remotePlayAtom);
    if (now?.play.item.Id !== itemId || remotePlayback().itemId !== itemId)
      return;
    const userId = deps.store.get(userAtom)?.Id;
    const remote = deps.target();
    const current = deps.store.get(apiAtom);
    if (!current?.accessToken || !userId || !remote) {
      await failed(deps.t()("player.subtitle_apply_failed"));
      return;
    }
    // The menus take the new subtitle from the item read again; it is checked once the TV reports it.
    deps.store.set(remotePlayAtom, {
      ...now,
      play: { ...now.play, item: found.item },
    });
    const receiverName = receiverNameFor({ friendlyName: remote.name });
    // No cap named: the TV keeps the quality it plays at.
    await reloadOnReceiver(
      {
        serverAddress: current.basePath,
        accessToken: current.accessToken,
        userId,
        ...(receiverName ? { receiverName } : {}),
      },
      { subtitleStreamIndex: found.index },
    );
    await updateNativePlayerSubtitleSearch({ status: "applied", results: [] });
  };

  return { search, download };
};
