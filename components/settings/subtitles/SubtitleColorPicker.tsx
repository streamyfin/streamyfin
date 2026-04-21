import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { ListItem } from "../../list/ListItem";

interface Props {
  settings: any;
  updateSettings: (settings: any) => void;
  pluginSettings?: any;
}

export const SubtitleColorPicker: React.FC<Props> = ({
  settings,
  updateSettings,
  pluginSettings,
}) => {
  const { t } = useTranslation();

  const subtitleColors = [
    { name: "White", value: "#FFFFFF" },
    { name: "Yellow", value: "#FFFF00" },
    { name: "Cyan", value: "#00FFFF" },
    { name: "Green", value: "#00FF00" },
    { name: "Magenta", value: "#FF00FF" },
    { name: "Red", value: "#FF0000" },
  ];

  return (
    <ListItem
      title={t("home.settings.subtitles.subtitle_color")}
      disabled={pluginSettings?.subtitleColor?.locked}
    >
      <View className='flex flex-row items-center space-x-2'>
        {subtitleColors.map((color) => (
          <TouchableOpacity
            key={color.value}
            onPress={() => updateSettings({ subtitleColor: color.value })}
            className={`w-6 h-6 rounded-full border-2 ${settings.subtitleColor === color.value ? "border-white" : "border-transparent"}`}
            style={{ backgroundColor: color.value }}
          />
        ))}
      </View>
    </ListItem>
  );
};
