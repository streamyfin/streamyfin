import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
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
  description: string;
}

const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  {
    id: "default",
    label: "Original",
    description: "Use video's original aspect ratio",
  },
  {
    id: "16:9",
    label: "16:9",
    description: "Widescreen (most common)",
  },
  {
    id: "4:3",
    label: "4:3",
    description: "Traditional TV format",
  },
  {
    id: "1:1",
    label: "1:1",
    description: "Square format",
  },
  {
    id: "21:9",
    label: "21:9",
    description: "Ultra-wide cinematic",
  },
];

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  currentRatio,
  onRatioChange,
  disabled = false,
}) => {
  const lightHapticFeedback = useHaptic("light");

  const handleRatioSelect = (ratio: AspectRatio) => {
    onRatioChange(ratio);
    lightHapticFeedback();
  };

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
      title='Aspect Ratio'
      groups={optionGroups}
      trigger={trigger}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};
