import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, TouchableOpacity } from "react-native";
import { useHaptic } from "@/hooks/useHaptic";

const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;

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

  // Hide on TV platforms since zeego doesn't support TV
  if (Platform.isTV || !DropdownMenu) return null;

  const handleRatioSelect = (ratio: AspectRatio) => {
    onRatioChange(ratio);
    lightHapticFeedback();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <TouchableOpacity
          disabled={disabled}
          className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
          style={{ opacity: disabled ? 0.5 : 1 }}
        >
          <Ionicons name='crop-outline' size={24} color='white' />
        </TouchableOpacity>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content>
        <DropdownMenu.Label>Aspect Ratio</DropdownMenu.Label>
        <DropdownMenu.Separator />

        {ASPECT_RATIO_OPTIONS.map((option) => (
          <DropdownMenu.CheckboxItem
            key={option.id}
            value={currentRatio === option.id ? "on" : "off"}
            onValueChange={() => handleRatioSelect(option.id)}
          >
            <DropdownMenu.ItemTitle>{option.label}</DropdownMenu.ItemTitle>
            <DropdownMenu.ItemSubtitle>
              {option.description}
            </DropdownMenu.ItemSubtitle>
            <DropdownMenu.ItemIndicator />
          </DropdownMenu.CheckboxItem>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};
