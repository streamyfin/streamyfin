import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, Platform } from "react-native";
import { Text } from "../common/Text";
import { Ionicons } from "@expo/vector-icons";
import { TVFocusable } from "../common/TVFocusable";

export type SeasonIndexState = {
  [key: string]: number | string;
};

type Props = {
  item: BaseItemDto;
  seasons: BaseItemDto[];
  selectedSeason?: BaseItemDto;
  onSelect: (season: BaseItemDto) => void;
};

export const SeasonDropdown: React.FC<Props> = ({
  item,
  seasons,
  selectedSeason,
  onSelect,
}) => {
  const { t } = useTranslation();

  // If no season is selected, use the first one
  const currentSeason = selectedSeason || seasons[0];
  const currentIndex = seasons.findIndex(s => s.Id === currentSeason.Id);
  
  const handlePrevious = () => {
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : seasons.length - 1;
    onSelect(seasons[prevIndex]);
  };

  const handleNext = () => {
    const nextIndex = (currentIndex + 1) % seasons.length;
    onSelect(seasons[nextIndex]);
  };

  if (Platform.isTV) {
    return (
      <View className="flex flex-row items-center">
        <TVFocusable
          hasTVPreferredFocus={true}
          onSelect={handlePrevious}
        >
          <View className="flex items-center justify-center bg-neutral-900 rounded-xl p-2 mr-2">
            <Ionicons name="chevron-back" size={20} color="white" />
          </View>
        </TVFocusable>
        
        <View className="flex items-center justify-center bg-neutral-800 rounded-xl px-4 py-2 mx-1">
          <Text>{currentSeason.Name}</Text>
        </View>
        
        <TVFocusable
          onSelect={handleNext}
        >
          <View className="flex items-center justify-center bg-neutral-900 rounded-xl p-2 ml-2">
            <Ionicons name="chevron-forward" size={20} color="white" />
          </View>
        </TVFocusable>
      </View>
    );
  }

  return (
    <View className="flex flex-row items-center">
      <TouchableOpacity
        onPress={handlePrevious}
        className="flex items-center justify-center bg-neutral-900 rounded-xl p-2 mr-2"
      >
        <Ionicons name="chevron-back" size={20} color="white" />
      </TouchableOpacity>
      
      <View className="flex items-center justify-center bg-neutral-800 rounded-xl px-4 py-2 mx-1">
        <Text>{currentSeason.Name}</Text>
      </View>
      
      <TouchableOpacity
        onPress={handleNext}
        className="flex items-center justify-center bg-neutral-900 rounded-xl p-2 ml-2"
      >
        <Ionicons name="chevron-forward" size={20} color="white" />
      </TouchableOpacity>
    </View>
  );
};