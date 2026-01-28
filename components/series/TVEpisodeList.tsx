import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVEpisodeCard } from "@/components/series/TVEpisodeCard";
import { useScaledTVTypography } from "@/constants/TVTypography";

const LIST_GAP = 24;
const VERTICAL_PADDING = 12;

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
  /** Horizontal padding for the list content (default: 80) */
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
  horizontalPadding = 80,
}) => {
  const typography = useScaledTVTypography();

  if (episodes.length === 0 && emptyText) {
    return (
      <Text
        style={{
          color: "#737373",
          fontSize: typography.callout,
          marginLeft: 20,
        }}
      >
        {emptyText}
      </Text>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef as React.RefObject<ScrollView>}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -horizontalPadding, overflow: "visible" }}
      contentContainerStyle={{
        paddingHorizontal: horizontalPadding,
        paddingVertical: VERTICAL_PADDING,
        gap: LIST_GAP,
      }}
    >
      {episodes.map((episode, index) => {
        const isCurrent = currentEpisodeId
          ? episode.Id === currentEpisodeId
          : false;
        return (
          <TVEpisodeCard
            key={episode.Id}
            episode={episode}
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
      })}
    </ScrollView>
  );
};
