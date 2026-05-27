import { Button, Host } from "@expo/ui/swift-ui";
import { buttonStyle } from "@expo/ui/swift-ui/modifiers";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
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
      <>
        <Host
          style={{
            height: 40,
            width: 80,
            flexDirection: "row",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          <Button
            modifiers={[
              buttonStyle(
                searchType === "Library" ? "glassProminent" : "glass",
              ),
            ]}
            onPress={() => setSearchType("Library")}
          >
            <Text>{t("search.library")}</Text>
          </Button>
        </Host>
        <Host
          style={{
            height: 40,
            width: 100,
            flexDirection: "row",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          <Button
            modifiers={[
              buttonStyle(
                searchType === "Discover" ? "glassProminent" : "glass",
              ),
            ]}
            onPress={() => setSearchType("Discover")}
          >
            <Text>{t("search.discover")}</Text>
          </Button>
        </Host>
      </>
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
