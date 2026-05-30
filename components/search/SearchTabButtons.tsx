import { Button, Host, HStack, Spacer } from "@expo/ui/swift-ui";
import { buttonStyle } from "@expo/ui/swift-ui/modifiers";
import { Platform, TouchableOpacity, View } from "react-native";
import { Tag } from "@/components/GenreTags";

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
  if (Platform.OS === "ios") {
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
