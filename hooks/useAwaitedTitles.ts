import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { MOST_AWAITED_TITLES } from "@/constants/Notifications";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  type AwaitedMediaType,
  type AwaitedTitle,
  type AwaitTitleRequest,
  awaitTitle,
  getAwaitedTitles,
  isAwaited,
  stopAwaitingTitle,
  withAwaited,
  withoutAwaited,
} from "@/utils/awaitedTitles";
import {
  isNotFound,
  readPluginRoute,
  retryPluginRead,
  statusOf,
} from "@/utils/pluginReads";
import { useOrderedWrites } from "./useOrderedWrites";

/** The query key every reader of the person's awaited titles shares. */
export const AWAITED_TITLES_QUERY = "myAwaitedTitles";

// The plugin's refusals on purpose: the title is already here (409), or it keeps no more of
// them, or cannot keep this one (400).
const isRefusal = (error: unknown): boolean =>
  statusOf(error) === 409 || statusOf(error) === 400;

/**
 * The titles the signed in person waits for on this server, changed optimistically like the
 * rest of their notification choices: the button moves at once, and comes back with a message
 * when the plugin refuses.
 */
export const useAwaitedTitles = ({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = [AWAITED_TITLES_QUERY, api?.basePath, user?.Id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => readPluginRoute(() => getAwaitedTitles(api!)),
    enabled: enabled && !!api && !!user?.Id,
    retry: retryPluginRead,
  });

  // Why a change failed, in the person's words. A 400 is a full list only when the list is.
  const sayWhy = (error: unknown) => {
    const status = statusOf(error);
    const full =
      (queryClient.getQueryData<AwaitedTitle[]>(key)?.length ?? 0) >=
      MOST_AWAITED_TITLES;
    toast.error(
      t(
        status === 409
          ? "seerr.awaited.already_here"
          : status === 400 && full
            ? "seerr.awaited.too_many"
            : "seerr.awaited.failed",
      ),
    );
  };

  // Each change is one title of its own, so a later one does not carry an earlier one.
  const apply = useOrderedWrites<AwaitedTitle[]>(key, {
    laterCarriesEarlier: false,
    onFailure: sayWhy,
    expected: isRefusal,
  });

  const supported = !(query.isError && isNotFound(query.error));
  // A failed read keeps what an earlier one returned, and a disabled query what it kept: a
  // plugin that lost the route, or stopped offering the event, would otherwise leave that
  // list showing.
  const titles = enabled && supported ? query.data : undefined;

  return {
    titles,
    supported,
    isAwaited: (mediaType: AwaitedMediaType, tmdbId: number) =>
      isAwaited(titles, mediaType, tmdbId),
    add: (request: AwaitTitleRequest) =>
      apply(
        (list) => withAwaited(list ?? [], request, new Date().toISOString()),
        () => awaitTitle(api!, request),
      ),
    remove: (mediaType: AwaitedMediaType, tmdbId: number) =>
      apply(
        (list) => withoutAwaited(list ?? [], mediaType, tmdbId),
        () => stopAwaitingTitle(api!, mediaType, tmdbId),
      ),
  };
};
