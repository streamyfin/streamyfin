import { Platform, TouchableOpacity, View } from "react-native";
import { Tag } from "@/components/GenreTags";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
// Load it lazily and only off-TV; TV never renders this component.
const { Button, Host, HStack, Spacer } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");
const { buttonStyle } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : require("@expo/ui/swift-ui/modifiers");

type ViewType = "Favorites" | "Watchlist";

interface FavoritesTabButtonsProps {
  viewType: ViewType;
  setViewType: (type: ViewType) => void;
  t: (key: string) => string;
}

export const FavoritesTabButtons: React.FC<FavoritesTabButtonsProps> = ({
  viewType,
  setViewType,
  t,
}) => {
  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <Host style={{ height: 40, flex: 1 }}>
        <HStack spacing={8}>
          <Button
            modifiers={[
              buttonStyle(
                viewType === "Favorites" ? "glassProminent" : "glass",
              ),
            ]}
            onPress={() => setViewType("Favorites")}
            label={t("tabs.favorites")}
          />
          <Button
            modifiers={[
              buttonStyle(
                viewType === "Watchlist" ? "glassProminent" : "glass",
              ),
            ]}
            onPress={() => setViewType("Watchlist")}
            label={t("favorites.watchlist")}
          />
          <Spacer />
        </HStack>
      </Host>
    );
  }

  // Android UI
  return (
    <View className='flex flex-row gap-1 mr-1'>
      <TouchableOpacity onPress={() => setViewType("Favorites")}>
        <Tag
          text={t("tabs.favorites")}
          textClass='p-1'
          className={viewType === "Favorites" ? "bg-purple-600" : undefined}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setViewType("Watchlist")}>
        <Tag
          text={t("favorites.watchlist")}
          textClass='p-1'
          className={viewType === "Watchlist" ? "bg-purple-600" : undefined}
        />
      </TouchableOpacity>
    </View>
  );
};
