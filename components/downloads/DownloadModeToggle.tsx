import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  DOWNLOAD_MODE_LABEL_KEYS,
  DOWNLOAD_MODES,
  type DownloadMode,
} from "@/constants/Downloads";

type Props = {
  value: DownloadMode;
  onChange: (mode: DownloadMode) => void;
};

export const DownloadModeToggle = ({ value, onChange }: Props) => {
  const { t } = useTranslation();

  return (
    <View className='flex flex-row bg-neutral-900 border border-neutral-800 rounded-xl p-1'>
      {DOWNLOAD_MODES.map((mode) => (
        <TouchableOpacity
          key={mode}
          accessibilityRole='button'
          accessibilityState={{ selected: mode === value }}
          className={`flex-1 items-center rounded-lg py-2 ${
            mode === value ? "bg-neutral-700" : ""
          }`}
          onPress={() => onChange(mode)}
        >
          <Text className={mode === value ? "" : "opacity-60"}>
            {t(DOWNLOAD_MODE_LABEL_KEYS[mode])}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
