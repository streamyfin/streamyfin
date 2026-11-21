import type { ImageProps } from "@expo/ui/swift-ui";
import { Ionicons } from "@expo/vector-icons";
import { Platform, TouchableOpacity, View } from "react-native";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
// Load it lazily and only off-TV; the player is phone only.
const { Host, Image, Picker } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : (require("@expo/ui/swift-ui") as typeof import("@expo/ui/swift-ui"));
const { accessibilityLabel, pickerStyle, tag } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : (require("@expo/ui/swift-ui/modifiers") as typeof import("@expo/ui/swift-ui/modifiers"));

/**
 * The height the system gives a segmented control. A Host cannot size itself
 * to its content, so it is told.
 */
const SEGMENTED_CONTROL_HEIGHT = 36;

export type AudiobookPlayerTab = "player" | "chapters" | "bookmarks" | "queue";

export interface AudiobookPlayerTabItem {
  tab: AudiobookPlayerTab;
  label: string;
}

const SYMBOLS: Record<
  AudiobookPlayerTab,
  NonNullable<ImageProps["systemName"]>
> = {
  player: "headphones",
  chapters: "list.bullet",
  bookmarks: "bookmark",
  queue: "text.line.first.and.arrowtriangle.forward",
};

const ICONS: Record<AudiobookPlayerTab, keyof typeof Ionicons.glyphMap> = {
  player: "headset",
  chapters: "list",
  bookmarks: "bookmark",
  queue: "albums",
};

interface Props {
  tabs: AudiobookPlayerTabItem[];
  activeTab: AudiobookPlayerTab;
  onSelect: (tab: AudiobookPlayerTab) => void;
}

/**
 * The audiobook player's views. Symbols, not words: four words do not fit
 * beside the close button in every language. iOS draws the system's
 * segmented control, glass from iOS 26, as the library tabs do.
 */
export const AudiobookPlayerTabs: React.FC<Props> = ({
  tabs,
  activeTab,
  onSelect,
}) => {
  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <Host style={{ flex: 1, height: SEGMENTED_CONTROL_HEIGHT }}>
        <Picker
          selection={activeTab}
          onSelectionChange={onSelect}
          modifiers={[pickerStyle("segmented")]}
        >
          {tabs.map(({ tab, label }) => (
            <Image
              key={tab}
              systemName={SYMBOLS[tab]}
              modifiers={[tag(tab), accessibilityLabel(label)]}
            />
          ))}
        </Picker>
      </Host>
    );
  }

  return (
    <View
      accessibilityRole='tablist'
      className='flex-1 flex-row p-1 rounded-xl bg-neutral-900'
    >
      {tabs.map(({ tab, label }) => {
        const selected = tab === activeTab;
        return (
          <TouchableOpacity
            key={tab}
            accessibilityRole='tab'
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab)}
            className={`flex-1 items-center py-1.5 rounded-lg ${
              selected ? "bg-neutral-700" : ""
            }`}
          >
            <Ionicons
              name={ICONS[tab]}
              size={18}
              color={selected ? "white" : "#a3a3a3"}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
