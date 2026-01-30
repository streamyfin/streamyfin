import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useCallback } from "react";
import { ScrollView, View } from "react-native";
import { TVHorizontalList } from "@/components/tv/TVHorizontalList";
import { TVPosterCard } from "@/components/tv/TVPosterCard";

interface TVEpisodeListProps {
  episodes: BaseItemDto[];
  /** Shows "Now Playing" badge on the episode matching this ID */
  currentEpisodeId?: string;
  /** Disable all cards (e.g., when modal is open) */
  disabled?: boolean;
  /** Handler when an episode is pressed */
  onEpisodePress: (episode: BaseItemDto) => void;
  /** Called when any episode is long-pressed */
  onEpisodeLongPress?: (episode: BaseItemDto) => void;
  /** Called when any episode gains focus */
  onFocus?: () => void;
  /** Called when any episode loses focus */
  onBlur?: () => void;
  /** Ref for programmatic scrolling */
  scrollViewRef?: React.RefObject<ScrollView | null>;
  /** Setter for the first episode ref (for focus guide destinations) */
  firstEpisodeRefSetter?: (ref: View | null) => void;
  /** Text to show when episodes array is empty */
  emptyText?: string;
  /** Horizontal padding for the list content */
  horizontalPadding?: number;
}

export const TVEpisodeList: React.FC<TVEpisodeListProps> = ({
  episodes,
  currentEpisodeId,
  disabled = false,
  onEpisodePress,
  onEpisodeLongPress,
  onFocus,
  onBlur,
  scrollViewRef,
  firstEpisodeRefSetter,
  emptyText,
  horizontalPadding,
}) => {
  const renderItem = useCallback(
    ({ item: episode, index }: { item: BaseItemDto; index: number }) => {
      const isCurrent = currentEpisodeId
        ? episode.Id === currentEpisodeId
        : false;
      return (
        <TVPosterCard
          item={episode}
          orientation='horizontal'
          onPress={() => onEpisodePress(episode)}
          onLongPress={
            onEpisodeLongPress ? () => onEpisodeLongPress(episode) : undefined
          }
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={isCurrent || disabled}
          focusableWhenDisabled={isCurrent}
          isCurrent={isCurrent}
          refSetter={index === 0 ? firstEpisodeRefSetter : undefined}
        />
      );
    },
    [
      currentEpisodeId,
      disabled,
      firstEpisodeRefSetter,
      onBlur,
      onEpisodeLongPress,
      onEpisodePress,
      onFocus,
    ],
  );

  const keyExtractor = useCallback((episode: BaseItemDto) => episode.Id!, []);

  return (
    <TVHorizontalList
      data={episodes}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      emptyText={emptyText}
      scrollViewRef={scrollViewRef}
      horizontalPadding={horizontalPadding}
    />
  );
};
