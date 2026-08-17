import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useQuery,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { CardRow } from "@/components/cards/CardRow";
import { useInView } from "@/hooks/useInView";
import { useSettings } from "@/utils/atoms/settings";

interface Props extends ViewProps {
  title?: string | null;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[]>;
  hideIfEmpty?: boolean;
  scrollY?: number; // For lazy loading
  enableLazyLoading?: boolean; // Enable/disable lazy loading
}

export const ScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  scrollY = 0,
  enableLazyLoading = false,
  ...props
}) => {
  const { ref, isInView, onLayout } = useInView(scrollY, {
    enabled: enableLazyLoading,
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKey,
    queryFn,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    enabled: enableLazyLoading ? isInView : true,
  });

  const { t } = useTranslation();
  const { settings } = useSettings();

  // Show skeleton if loading OR if lazy loading is enabled and not in view yet
  const shouldShowSkeleton = isLoading || (enableLazyLoading && !isInView);

  if (hideIfEmpty === true && data?.length === 0 && !shouldShowSkeleton)
    return null;
  if (disabled || !title) return null;

  return (
    <View ref={ref} onLayout={onLayout} {...props}>
      <CardRow
        title={title}
        kind={orientation === "horizontal" ? "wide" : "portrait"}
        items={data ?? []}
        useEpisodePoster={settings?.useEpisodeImagesForNextUp}
        loading={shouldShowSkeleton}
        emptyText={t("home.no_items")}
      />
    </View>
  );
};
