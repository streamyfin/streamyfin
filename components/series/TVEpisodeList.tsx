import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useCallback } from "react";
import { type ScrollViewInstance, View, type ViewInstance } from "react-native";
import { Text } from "@/components/common/Text";
import { TVHorizontalList } from "@/components/tv/TVHorizontalList";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { TVPosterPill } from "@/components/tv/TVPosterPill";
import { TV_SKELETON } from "@/constants/Colors";
import { useScaledTVPosterSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useEpisodeAirLabels } from "@/hooks/useEpisodeAirLabels";
import { scaleSize } from "@/utils/scaleSize";

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
  scrollViewRef?: React.RefObject<ScrollViewInstance | null>;
  /** Setter for the first episode ref (for focus guide destinations) */
  firstEpisodeRefSetter?: (ref: ViewInstance | null) => void;
  /** Text to show when episodes array is empty */
  emptyText?: string;
  /** The episodes are still on their way: an empty list is not an empty season yet. */
  isLoading?: boolean;
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
  isLoading = false,
  horizontalPadding,
}) => {
  const { availabilityLabel } = useEpisodeAirLabels();

  const renderItem = useCallback(
    ({ item: episode, index }: { item: BaseItemDto; index: number }) => {
      const isCurrent = currentEpisodeId
        ? episode.Id === currentEpisodeId
        : false;
      // An episode the library has no file for says so, rather than looking
      // like one that plays.
      const unavailable = availabilityLabel(episode);
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
          overlay={
            unavailable ? <TVPosterPill label={unavailable} /> : undefined
          }
          // Each episode's own image, as on the phone's series and episode
          // pages; the Next up setting is for the Next Up and Continue
          // Watching rows.
          preferEpisodeImage
        />
      );
    },
    [
      availabilityLabel,
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

  // While the episodes load, cards in their shape hold the row: an empty row
  // read as nothing happening. The shape includes the label line and the
  // title TVPosterCard draws under an episode, in the same type, so the row
  // keeps its height when the cards arrive.
  const posterSizes = useScaledTVPosterSizes();
  const typography = useScaledTVTypography();
  const renderSkeleton = useCallback(() => {
    const line = {
      fontSize: typography.callout,
      color: TV_SKELETON,
      backgroundColor: TV_SKELETON,
      borderRadius: 6,
      overflow: "hidden" as const,
    };
    return (
      <View style={{ width: posterSizes.episode }}>
        <View
          testID='tv-episode-skeleton'
          style={{
            width: posterSizes.episode,
            aspectRatio: 16 / 9,
            borderRadius: scaleSize(24),
            backgroundColor: TV_SKELETON,
          }}
        />
        {/* Text there for its height only: read aloud, it named an episode
            that is not there. */}
        <View
          testID='tv-episode-skeleton-text'
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
          style={{
            marginTop: scaleSize(12),
            paddingHorizontal: scaleSize(4),
            alignItems: "flex-start",
          }}
        >
          <Text style={line}>S1:E1 • 45 min</Text>
          <Text style={[line, { marginTop: scaleSize(4) }]}>Episode title</Text>
        </View>
      </View>
    );
  }, [posterSizes.episode, typography.callout]);

  return (
    <TVHorizontalList
      data={episodes}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      emptyText={emptyText}
      isLoading={isLoading}
      renderSkeleton={renderSkeleton}
      scrollViewRef={scrollViewRef}
      horizontalPadding={horizontalPadding}
    />
  );
};
