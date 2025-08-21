import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { View } from "react-native";
import SelectBottomSheet, {
  type SelectOptionGroup,
} from "@/components/common/SelectBottomSheet";
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

  const optionGroups = useMemo((): SelectOptionGroup[] => {
    return [
      {
        id: "aspect-ratio",
        title: "Aspect Ratio",
        options: ASPECT_RATIO_OPTIONS.map((option) => ({
          id: option.id,
          label: option.label,
          value: option.id,
          selected: currentRatio === option.id,
          onSelect: () => handleRatioSelect(option.id),
        })),
      },
    ];
  }, [currentRatio, handleRatioSelect]);

  if (disabled) {
    return (
      <View className='aspect-square flex flex-col rounded-xl items-center justify-center p-2 opacity-50'>
        <Ionicons name='crop-outline' size={24} color='white' />
      </View>
    );
  }

  return (
    <SelectBottomSheet
      title='Aspect Ratio'
      subtitle='Choose video aspect ratio format'
      groups={optionGroups}
      triggerIcon='crop-outline'
      triggerSize={24}
      triggerColor='white'
    />
  );
};
