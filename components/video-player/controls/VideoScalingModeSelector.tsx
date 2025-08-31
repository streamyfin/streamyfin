import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, TouchableOpacity } from "react-native";
import { Text } from "@/components/common/Text";
import { FilterSheet } from "@/components/filters/FilterSheet";
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
  const [open, setOpen] = useState(false);

  // Hide on TV platforms
  if (Platform.isTV) return null;

  const handleRatioSelect = (ratio: AspectRatio) => {
    onRatioChange(ratio);
    lightHapticFeedback();
  };

  const currentOption = ASPECT_RATIO_OPTIONS.find(
    (option) => option.id === currentRatio,
  );

  return (
    <>
      <TouchableOpacity
        disabled={disabled}
        className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
        style={{ opacity: disabled ? 0.5 : 1 }}
        onPress={() => setOpen(true)}
      >
        <Ionicons name='crop-outline' size={24} color='white' />
      </TouchableOpacity>

      <FilterSheet
        open={open}
        setOpen={setOpen}
        title='Aspect Ratio'
        data={ASPECT_RATIO_OPTIONS}
        values={currentOption ? [currentOption] : []}
        multiple={false}
        searchFilter={(item, query) => {
          const option = item as AspectRatioOption;
          return (
            option.label.toLowerCase().includes(query.toLowerCase()) ||
            option.description.toLowerCase().includes(query.toLowerCase())
          );
        }}
        renderItemLabel={(item) => {
          const option = item as AspectRatioOption;
          return <Text>{option.label}</Text>;
        }}
        set={(vals) => {
          const chosen = vals[0] as AspectRatioOption | undefined;
          if (chosen) {
            handleRatioSelect(chosen.id);
          }
        }}
      />
    </>
  );
};
