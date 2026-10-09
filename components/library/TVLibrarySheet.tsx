import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  FlatList,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVOptionCard } from "@/components/tv/TVOptionCard";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import type {
  TVLibrarySheetGroup,
  TVLibrarySheetState,
} from "@/utils/atoms/tvLibrarySheet";
import type { TVLibrarySheetPlacement } from "@/utils/library/librarySheet";
import { scaleSize } from "@/utils/scaleSize";

const SLIDE_DISTANCE = 200;
const PANEL_WIDTH = scaleSize(560);
const EDGE_PADDING = scaleSize(48);
const CARD_GAP = scaleSize(12);
const OPTION_CARD = { width: scaleSize(160), height: scaleSize(75) };
// A group's card carries its label and what it is set to.
const GROUP_CARD = { width: scaleSize(260), height: scaleSize(96) };
const COMPACT_CARD = { width: scaleSize(72), height: scaleSize(64) };
const ROW_HEIGHT = scaleSize(72);
const PANEL_BACKING = "rgba(18, 18, 20, 0.96)";

type Card = {
  key: string;
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
};

/** The sheet shows either its groups or the options of the one that is open. */
type Level = { group: string | null; focusIndex: number };

interface Props {
  sheet: NonNullable<TVLibrarySheetState>;
  placement: TVLibrarySheetPlacement;
  onClose: () => void;
}

const firstSelected = (group: TVLibrarySheetGroup) =>
  Math.max(
    0,
    group.options.findIndex((option) => option.selected),
  );

/**
 * The library page's filters, sort and letter jump, off the page. A sheet
 * with several groups lists them with what each is set to, and a group opens
 * in place; a sheet with one group is that group's options straight away.
 */
export const TVLibrarySheet: React.FC<Props> = ({
  sheet,
  placement,
  onClose,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const isSingleGroup = sheet.groups.length === 1;

  const [level, setLevel] = useState<Level>(() =>
    isSingleGroup
      ? {
          group: sheet.groups[0].key,
          focusIndex: firstSelected(sheet.groups[0]),
        }
      : { group: null, focusIndex: 0 },
  );
  const openGroup = sheet.groups.find((group) => group.key === level.group);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, slide]);

  // The card the focus belongs on is asked for it by hand as well: a list
  // that swaps its content does not get its preferred focus honoured twice.
  const focusRef = useRef<View>(null);
  useEffect(() => {
    const timer = setTimeout(
      () => (focusRef.current as any)?.requestTVFocus?.(),
      150,
    );
    return () => clearTimeout(timer);
  }, [level.group]);

  const backToGroups = (from: string) =>
    setLevel({
      group: null,
      focusIndex: Math.max(
        0,
        sheet.groups.findIndex((group) => group.key === from),
      ),
    });

  // Back steps out of a group first, and only then out of the sheet.
  useTVBackPress(() => {
    if (openGroup && !isSingleGroup) backToGroups(openGroup.key);
    else onClose();
    return true;
  }, [openGroup, isSingleGroup, onClose]);

  const select = (group: TVLibrarySheetGroup, value: string) => {
    // Applied while the sheet is up: a page that re-renders after the focus
    // has gone back to it takes the focus with it.
    group.onSelect(value);
    if (group.multi) return;
    if (isSingleGroup) onClose();
    else backToGroups(group.key);
  };

  const cards: Card[] = openGroup
    ? openGroup.options.map((option) => ({
        key: option.value,
        label: option.label,
        selected: option.selected,
        onPress: () => select(openGroup, option.value),
      }))
    : [
        ...sheet.groups.map((group) => ({
          key: group.key,
          label: group.label,
          sublabel: group.summary,
          selected: false,
          onPress: () =>
            setLevel({ group: group.key, focusIndex: firstSelected(group) }),
        })),
        ...(sheet.onReset
          ? [
              {
                key: "reset",
                label: t("library.filters.reset"),
                selected: false,
                onPress: sheet.onReset,
              },
            ]
          : []),
      ];

  const isRight = placement === "right";
  const isCompact = !!openGroup?.compact;
  const size = isRight
    ? {
        width: PANEL_WIDTH - 2 * EDGE_PADDING,
        height: openGroup ? ROW_HEIGHT : GROUP_CARD.height,
      }
    : openGroup
      ? OPTION_CARD
      : GROUP_CARD;
  const title =
    openGroup && !isSingleGroup
      ? `${sheet.title} · ${openGroup.label}`
      : sheet.title;

  const renderCard = (card: Card, index: number, cardSize = size) => (
    <TVOptionCard
      key={card.key}
      ref={index === level.focusIndex ? focusRef : undefined}
      label={card.label}
      sublabel={card.sublabel}
      selected={card.selected}
      hasTVPreferredFocus={index === level.focusIndex}
      onPress={card.onPress}
      width={cardSize.width}
      height={cardSize.height}
    />
  );

  const step = (isRight ? size.height : size.width) + CARD_GAP;

  return (
    <Animated.View
      style={[
        styles.overlay,
        isRight ? styles.overlayRight : styles.overlayBottom,
        { opacity: overlayOpacity },
      ]}
    >
      <Animated.View
        style={[
          isRight ? styles.panel : styles.sheet,
          {
            transform: [
              isRight ? { translateX: slide } : { translateY: slide },
            ],
          },
        ]}
      >
        <BlurView
          intensity={80}
          tint='dark'
          style={isRight ? styles.blurRight : styles.blurBottom}
        >
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={isRight ? styles.contentRight : styles.contentBottom}
          >
            <Text style={[styles.title, { fontSize: typography.callout }]}>
              {title}
            </Text>
            {isCompact ? (
              <View key={level.group} style={styles.grid}>
                {cards.map((card, index) =>
                  renderCard(card, index, COMPACT_CARD),
                )}
              </View>
            ) : (
              // Keyed by level, so each one mounts on the card it opens on.
              // Windowed: a language filter carries the server's whole list.
              <FlatList
                key={level.group ?? "groups"}
                horizontal={!isRight}
                data={cards}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyExtractor={(card) => card.key}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                initialScrollIndex={level.focusIndex}
                getItemLayout={(_, index) => ({
                  length: step,
                  offset: step * index,
                  index,
                })}
                // A generous buffer: the focus moves card by card, and one
                // landing on a card not mounted yet drops to the overlay.
                initialNumToRender={24}
                windowSize={11}
                removeClippedSubviews={false}
                renderItem={({ item, index }) => renderCard(item, index)}
              />
            )}
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)" },
  overlayBottom: { justifyContent: "flex-end" },
  overlayRight: { flexDirection: "row", justifyContent: "flex-end" },
  sheet: { width: "100%" },
  panel: { width: PANEL_WIDTH, height: "100%" },
  blurBottom: {
    borderTopLeftRadius: scaleSize(24),
    borderTopRightRadius: scaleSize(24),
    overflow: "hidden",
  },
  blurRight: {
    flex: 1,
    borderTopLeftRadius: scaleSize(24),
    borderBottomLeftRadius: scaleSize(24),
    overflow: "hidden",
  },
  contentBottom: {
    paddingTop: scaleSize(24),
    paddingBottom: scaleSize(50),
    overflow: "visible",
  },
  contentRight: {
    flex: 1,
    // Android TV does not blur what is behind a BlurView, it only tints it:
    // without a backing of its own the posters show through the rows.
    backgroundColor: PANEL_BACKING,
    paddingTop: scaleSize(60),
    paddingBottom: scaleSize(40),
    overflow: "visible",
  },
  title: {
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginBottom: scaleSize(16),
    paddingHorizontal: EDGE_PADDING,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  list: { overflow: "visible" },
  listContent: {
    paddingHorizontal: EDGE_PADDING,
    paddingVertical: scaleSize(20),
    gap: CARD_GAP,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
    paddingHorizontal: EDGE_PADDING,
    paddingVertical: scaleSize(20),
  },
});
