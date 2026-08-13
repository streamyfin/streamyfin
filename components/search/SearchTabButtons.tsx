import { Platform, TouchableOpacity, View } from "react-native";
import { Tag } from "@/components/GenreTags";

// @expo/ui's SwiftUI native module (ExpoUI) exists only in non-TV iOS builds —
// not on tvOS, and not on web (the desktop client). A static top-level import
// crashes the route tree at module load. Load it lazily and only on iOS.
const USES_SWIFT_UI = Platform.OS === "ios" && !Platform.isTV;

const { Button, Host, HStack, Spacer } = USES_SWIFT_UI
  ? require("@expo/ui/swift-ui")
  : ({} as typeof import("@expo/ui/swift-ui"));
const { buttonStyle } = USES_SWIFT_UI
  ? require("@expo/ui/swift-ui/modifiers")
  : ({} as typeof import("@expo/ui/swift-ui/modifiers"));

type SearchType = "Library" | "Discover";

interface SearchTabButtonsProps {
  searchType: SearchType;
  setSearchType: (type: SearchType) => void;
  t: (key: string) => string;
}

export const SearchTabButtons: React.FC<SearchTabButtonsProps> = ({
  searchType,
  setSearchType,
  t,
}) => {
  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <Host style={{ height: 40, flex: 1 }}>
        <HStack spacing={8}>
          <Button
            modifiers={[
              buttonStyle(
                searchType === "Library" ? "glassProminent" : "glass",
              ),
            ]}
            onPress={() => setSearchType("Library")}
            label={t("search.library")}
          />
          <Button
            modifiers={[
              buttonStyle(
                searchType === "Discover" ? "glassProminent" : "glass",
              ),
            ]}
            onPress={() => setSearchType("Discover")}
            label={t("search.discover")}
          />
          <Spacer />
        </HStack>
      </Host>
    );
  }

  // Android UI
  return (
    <View className='flex flex-row gap-1 mr-1'>
      <TouchableOpacity onPress={() => setSearchType("Library")}>
        <Tag
          text={t("search.library")}
          textClass='p-1'
          className={searchType === "Library" ? "bg-purple-600" : undefined}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setSearchType("Discover")}>
        <Tag
          text={t("search.discover")}
          textClass='p-1'
          className={searchType === "Discover" ? "bg-purple-600" : undefined}
        />
      </TouchableOpacity>
    </View>
  );
};
