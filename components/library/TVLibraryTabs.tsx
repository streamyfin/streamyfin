import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { TVTabButton } from "@/components/tv/TVTabButton";
import {
  LIBRARY_TAB_LABEL_KEYS,
  type LibraryTab,
} from "@/utils/library/libraryTabs";

interface Props {
  tabs: LibraryTab[];
  activeTab: LibraryTab;
  onSelect: (tab: LibraryTab) => void;
}

/**
 * The TV counterpart of `LibraryTabs`. A tab is selected by pressing it, not
 * by focusing it, so walking across the row does not reload the grid at every
 * step. No button asks for the initial focus: the row mounts once its counts
 * have answered, and would pull the focus away from wherever it is by then.
 */
export const TVLibraryTabs: React.FC<Props> = ({
  tabs,
  activeTab,
  onSelect,
}) => {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
      }}
    >
      {tabs.map((tab) => (
        <TVTabButton
          key={tab}
          label={t(LIBRARY_TAB_LABEL_KEYS[tab])}
          active={tab === activeTab}
          onSelect={() => onSelect(tab)}
        />
      ))}
    </View>
  );
};
