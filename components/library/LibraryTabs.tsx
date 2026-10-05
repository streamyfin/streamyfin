import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  LIBRARY_TAB_LABEL_KEYS,
  type LibraryTab,
} from "@/utils/library/libraryTabs";

interface Props {
  tabs: LibraryTab[];
  activeTab: LibraryTab;
  onSelect: (tab: LibraryTab) => void;
}

/** The segmented control that switches a library between its tabs. */
export const LibraryTabs: React.FC<Props> = ({ tabs, activeTab, onSelect }) => {
  const { t } = useTranslation();

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
