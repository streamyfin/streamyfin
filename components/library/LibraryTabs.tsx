import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  LIBRARY_TAB_LABEL_KEYS,
  type LibraryTab,
} from "@/utils/library/libraryTabs";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
// Load it lazily and only off-TV; TV has its own tabs.
const {
  Host,
  Picker,
  Text: SwiftUIText,
} = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");
const { pickerStyle, tag } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : require("@expo/ui/swift-ui/modifiers");

/**
 * The height the system gives a segmented control. A Host cannot size itself
 * to its content, so it is told.
 */
const SEGMENTED_CONTROL_HEIGHT = 36;

interface Props {
  tabs: LibraryTab[];
  activeTab: LibraryTab;
  onSelect: (tab: LibraryTab) => void;
}

/** The segmented control that switches a library between its tabs. */
export const LibraryTabs: React.FC<Props> = ({ tabs, activeTab, onSelect }) => {
  const { t } = useTranslation();

  // The system's own control on iOS, which is glass from iOS 26 like the
  // header buttons and the tab bar around it.
  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <View className='mx-4 mt-4'>
        <Host style={{ height: SEGMENTED_CONTROL_HEIGHT }}>
          <Picker
            selection={activeTab}
            onSelectionChange={onSelect}
            modifiers={[pickerStyle("segmented")]}
          >
            {tabs.map((tab) => (
              <SwiftUIText key={tab} modifiers={[tag(tab)]}>
                {t(LIBRARY_TAB_LABEL_KEYS[tab])}
              </SwiftUIText>
            ))}
          </Picker>
        </Host>
      </View>
    );
  }

  return (
    <View
      accessibilityRole='tablist'
      className='flex flex-row mx-4 mt-4 p-1 rounded-xl bg-neutral-900'
    >
      {tabs.map((tab) => {
        const selected = tab === activeTab;
        return (
          <TouchableOpacity
            key={tab}
            accessibilityRole='tab'
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab)}
            className={`flex-1 items-center py-1.5 rounded-lg ${
              selected ? "bg-neutral-700" : ""
            }`}
          >
            <Text
              numberOfLines={1}
              // Three segments share a phone's width, and a translation can be
              // twice as long as "Playlists".
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              className={`text-sm font-semibold ${
                selected ? "text-white" : "text-neutral-400"
              }`}
            >
              {t(LIBRARY_TAB_LABEL_KEYS[tab])}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
