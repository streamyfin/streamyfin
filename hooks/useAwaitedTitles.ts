import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
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

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

/** The query key every reader of the person's awaited titles shares. */
export const AWAITED_TITLES_QUERY = "myAwaitedTitles";

// Why the plugin refused a title, in the person's words.
const REFUSALS: Record<number, string> = {
  409: "seerr.awaited.already_here",
  400: "seerr.awaited.too_many",
};

/**
 * The titles the signed in person waits for on this server, changed optimistically like the
 * rest of their notification choices: the button moves at once, and comes back with a message
 * when the plugin refuses.
 */
export const useAwaitedTitles = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = [AWAITED_TITLES_QUERY, api?.basePath, user?.Id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => getAwaitedTitles(api!),
    enabled: !!api && !!user?.Id,
    // A plugin without the route answers 404, which only means nothing is offered.
    retry: (count, error) => statusOf(error) !== 404 && count < 2,
  });

  const run = useMutation({
    mutationFn: (change: () => Promise<AwaitedTitle[]>) => change(),
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });

  const apply = async (
    next: (list: AwaitedTitle[]) => AwaitedTitle[],
    change: () => Promise<AwaitedTitle[]>,
  ) => {
    const before = queryClient.getQueryData<AwaitedTitle[]>(key);
    // What the cache holds once this change is in it, to tell later whether a newer change
    // replaced it.
    const shown = queryClient.setQueryData<AwaitedTitle[]>(
      key,
      next(before ?? []),
    );
    try {
      await run.mutateAsync(change);
    } catch (error) {
      // Only while this change is still what shows: a later one may have saved since.
      if (queryClient.getQueryData(key) === shown) {
        queryClient.setQueryData(key, before);
      }
      toast.error(t(REFUSALS[statusOf(error) ?? 0] ?? "seerr.awaited.failed"));
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const supported = !(query.isError && statusOf(query.error) === 404);
  // A failed read keeps what an earlier one returned: a plugin that lost the route would
  // otherwise leave that list showing, with no route left to change it.
  const titles = supported ? query.data : undefined;

  return {
    titles,
    supported,
    isLoading: query.isLoading,
    isAwaited: (mediaType: AwaitedMediaType, tmdbId: number) =>
      isAwaited(titles, mediaType, tmdbId),
    add: (request: AwaitTitleRequest) =>
      apply(
        (list) => withAwaited(list, request, new Date().toISOString()),
        () => awaitTitle(api!, request),
      ),
    remove: (mediaType: AwaitedMediaType, tmdbId: number) =>
      apply(
        (list) => withoutAwaited(list, mediaType, tmdbId),
        () => stopAwaitingTitle(api!, mediaType, tmdbId),
      ),
  };
};
