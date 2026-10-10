import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { CardRow } from "@/components/cards/CardRow";
import { useSettings } from "@/utils/atoms/settings";

interface Props extends ViewProps {
  title?: string | null;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[], QueryKey, number>;
  hideIfEmpty?: boolean;
  pageSize?: number;
  onPressSeeAll?: () => void;
  /** Show a TV child's series name before its own name. */
  showParentTitle?: boolean;
  enabled?: boolean;
  onLoaded?: () => void;
  /**
   * Reports emptiness whenever the query settles (incl. cache hits):
   * `null` while loading (unknown), otherwise whether the list is empty.
   * Lets a parent derive an aggregate empty-state reactively instead of via a
   * queryFn side effect, which React Query skips when it serves cache.
   */
  onEmptyStateChange?: (isEmpty: boolean | null) => void;
  /**
   * Whether the last load failed. Emptiness reports null for a failure, which
   * reads the same as still loading; this tells the two apart.
   */
  onErrorChange?: (isError: boolean) => void;
}

export const InfiniteScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  pageSize = 10,
  onPressSeeAll,
  showParentTitle = false,
  enabled = true,
  onLoaded,
  onEmptyStateChange,
  onErrorChange,
  ...props
}) => {
  const effectivePageSize = Math.max(1, pageSize);
  const hasCalledOnLoaded = useRef(false);
  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isSuccess,
  } = useInfiniteQuery({
    queryKey: queryKey,
    queryFn: ({ pageParam = 0, ...context }) =>
      queryFn({ ...context, queryKey, pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      // If the last page has fewer items than pageSize, we've reached the end
      if (lastPage.length < effectivePageSize) {
        return undefined;
      }
      // Otherwise, return the next start index based on how many items we already loaded.
      // This avoids overlaps if the server/page size differs from our configured page size.
      return allPages.reduce((acc, page) => acc + page.length, 0);
    },
    initialPageParam: 0,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    enabled,
  });

  // Notify parent when data has loaded
  useEffect(() => {
    if (isSuccess && !hasCalledOnLoaded.current && onLoaded) {
      hasCalledOnLoaded.current = true;
      onLoaded();
    }
  }, [isSuccess, onLoaded]);

  const { t } = useTranslation();
  const { settings } = useSettings();

  // Flatten all pages into a single array (and de-dupe by Id to avoid UI duplicates)
  const allItems = useMemo(() => {
    const items = data?.pages.flat() ?? [];
    const seen = new Set<string>();
    const deduped: BaseItemDto[] = [];

    for (const item of items) {
      const id = item.Id;
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(item);
    }

    return deduped;
  }, [data]);

  // Report emptiness on every settle (incl. cache hits). Errors report null
  // (unknown) so a failed fetch never reads as "no content". Callback held in
  // a ref so an inline parent callback doesn't retrigger the effect each render.
  const onEmptyStateChangeRef = useRef(onEmptyStateChange);
  onEmptyStateChangeRef.current = onEmptyStateChange;
  useEffect(() => {
    onEmptyStateChangeRef.current?.(
      isLoading || isError ? null : allItems.length === 0,
    );
  }, [isLoading, isError, allItems.length]);

  const onErrorChangeRef = useRef(onErrorChange);
  onErrorChangeRef.current = onErrorChange;
  useEffect(() => {
    onErrorChangeRef.current?.(isError);
  }, [isError]);

  if (disabled || !title) return null;

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <CardRow
      enableActionSheet
      {...props}
      title={title}
      kind={orientation === "horizontal" ? "wide" : "portrait"}
      items={allItems}
      useEpisodePoster={settings?.useEpisodeImagesForNextUp}
      showParentTitle={showParentTitle}
      loading={isLoading}
      loadingMore={isFetchingNextPage}
      onEndReached={loadMore}
      hideIfEmpty={hideIfEmpty}
      emptyText={t("home.no_items")}
      onPressSeeAll={onPressSeeAll}
      seeAllLabel={t("common.seeAll", { defaultValue: "See all" })}
    />
  );
};
