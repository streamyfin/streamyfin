import { useActionSheet } from "@expo/react-native-action-sheet";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { HeaderButton } from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { Text } from "@/components/common/Text";
import { type TrailerSourceItem, useTrailers } from "@/hooks/useTrailers";
import { trailerLabels } from "@/utils/jellyfin/media/trailers";

interface Props {
  item: TrailerSourceItem;
  /**
   * Round like the buttons beside Play, or `"header"` for a native stack
   * header, where an icon stands alone.
   */
  variant?: "round" | "header";
  /** Tints the round button like its neighbours. */
  color?: string;
  iconColor?: string;
  /**
   * Space to the control before it. A prop and not a style, as on
   * SyncPlayQueueButton: the row's own spacing would add to a margin.
   */
  leadingGap?: number;
}

/** Tap plays the preferred trailer, long press lists every one. */
export const ItemActions = ({
  item,
  variant = "round",
  color = "#262626",
  iconColor = "white",
  leadingGap = 0,
}: Props) => {
  const { t } = useTranslation();
  const { showActionSheetWithOptions } = useActionSheet();
  const { trailers, playTrailer } = useTrailers(item);

  const playPreferred = useCallback(() => {
    if (trailers[0]) playTrailer(trailers[0]);
  }, [trailers, playTrailer]);

  const chooseTrailer = useCallback(() => {
    showActionSheetWithOptions(
      {
        title: t("item_card.choose_trailer"),
        options: [...trailerLabels(t, trailers), t("common.cancel")],
        cancelButtonIndex: trailers.length,
      },
      (index) => {
        const trailer = index === undefined ? undefined : trailers[index];
        if (trailer) playTrailer(trailer);
      },
    );
  }, [trailers, playTrailer, showActionSheetWithOptions, t]);

  if (trailers.length === 0) return null;

  const label = t("item_card.trailer_count", { count: trailers.length });

  if (variant === "header") {
    return (
      <HeaderButton
        onPress={playPreferred}
        onLongPress={chooseTrailer}
        accessibilityRole='button'
        accessibilityLabel={label}
      >
        <HeaderIcon name='trailer' />
      </HeaderButton>
    );
  }

  return (
    <TouchableOpacity
      onPress={playPreferred}
      onLongPress={chooseTrailer}
      accessibilityRole='button'
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className='relative'
      style={{ marginLeft: leadingGap }}
    >
      <View
        style={{ backgroundColor: color, opacity: 0.7 }}
        className='absolute w-12 h-12 rounded-full'
      />
      <View className='w-12 h-12 rounded-full z-10 items-center justify-center'>
        <HeaderIcon name='trailer' tintColor={iconColor} />
      </View>
      {/* More than one: say so, as a hint the long press lists them. */}
      {trailers.length > 1 && (
        <View
          className='absolute -top-1 -right-1 z-20 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center'
          style={{ backgroundColor: iconColor }}
        >
          <Text style={{ color, fontSize: 11, fontWeight: "700" }}>
            {trailers.length}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
