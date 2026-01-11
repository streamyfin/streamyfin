import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";
import { useHaptic } from "@/hooks/useHaptic";

export type AspectRatio = "default" | "16:9" | "4:3" | "1:1" | "21:9";

interface AspectRatioSelectorProps {
  currentRatio: AspectRatio;
  onRatioChange: (ratio: AspectRatio) => void;
  disabled?: boolean;
}

interface AspectRatioOption {
  id: AspectRatio;
  label: string;
  descriptionKey: string;
}

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  currentRatio,
  onRatioChange,
  disabled = false,
}) => {
  const lightHapticFeedback = useHaptic("light");
  const { t } = useTranslation();

  const handleRatioSelect = (ratio: AspectRatio) => {
    onRatioChange(ratio);
    lightHapticFeedback();
  };

  const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
    {
      id: "default",
      label: t("player.aspect_ratio_original"),
      descriptionKey: "player.aspect_ratio_original_description",
    },
    {
      id: "16:9",
      label: "16:9",
      descriptionKey: "player.aspect_ratio_16_9_description",
    },
    {
      id: "4:3",
      label: "4:3",
      descriptionKey: "player.aspect_ratio_4_3_description",
    },
    {
      id: "1:1",
      label: "1:1",
      descriptionKey: "player.aspect_ratio_1_1_description",
    },
    {
      id: "21:9",
      label: "21:9",
      descriptionKey: "player.aspect_ratio_21_9_description",
    },
  ];

  const optionGroups = useMemo<OptionGroup[]>(() => {
    return [
      {
        options: ASPECT_RATIO_OPTIONS.map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.id,
          selected: option.id === currentRatio,
          onPress: () => handleRatioSelect(option.id),
          disabled,
        })),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRatio, disabled]);

  const trigger = useMemo(
    () => (
      <View
        className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Ionicons name='crop-outline' size={24} color='white' />
      </View>
    ),
    [disabled],
  );

  // Hide on TV platforms
  if (Platform.isTV) return null;

  return (
    <PlatformDropdown
      title={t("player.aspect_ratio_title")}
      groups={optionGroups}
      trigger={trigger}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};
