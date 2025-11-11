import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Platform, View } from "react-native";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";
import { useHaptic } from "@/hooks/useHaptic";

export type ScaleFactor =
  | 1.0
  | 1.1
  | 1.2
  | 1.3
  | 1.4
  | 1.5
  | 1.6
  | 1.7
  | 1.8
  | 1.9
  | 2.0;

interface ScaleFactorSelectorProps {
  currentScale: ScaleFactor;
  onScaleChange: (scale: ScaleFactor) => void;
  disabled?: boolean;
}

interface ScaleFactorOption {
  id: ScaleFactor;
  label: string;
  description: string;
}

const SCALE_FACTOR_OPTIONS: ScaleFactorOption[] = [
  {
    id: 1.0,
    label: "1.0x",
    description: "Original size",
  },
  {
    id: 1.1,
    label: "1.1x",
    description: "10% larger",
  },
  {
    id: 1.2,
    label: "1.2x",
    description: "20% larger",
  },
  {
    id: 1.3,
    label: "1.3x",
    description: "30% larger",
  },
  {
    id: 1.4,
    label: "1.4x",
    description: "40% larger",
  },
  {
    id: 1.5,
    label: "1.5x",
    description: "50% larger",
  },
  {
    id: 1.6,
    label: "1.6x",
    description: "60% larger",
  },
  {
    id: 1.7,
    label: "1.7x",
    description: "70% larger",
  },
  {
    id: 1.8,
    label: "1.8x",
    description: "80% larger",
  },
  {
    id: 1.9,
    label: "1.9x",
    description: "90% larger",
  },
  {
    id: 2.0,
    label: "2.0x",
    description: "Double size",
  },
];

export const ScaleFactorSelector: React.FC<ScaleFactorSelectorProps> = ({
  currentScale,
  onScaleChange,
  disabled = false,
}) => {
  const lightHapticFeedback = useHaptic("light");

  const handleScaleSelect = (scale: ScaleFactor) => {
    onScaleChange(scale);
    lightHapticFeedback();
  };

  const optionGroups = useMemo<OptionGroup[]>(() => {
    return [
      {
        options: SCALE_FACTOR_OPTIONS.map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.id,
          selected: option.id === currentScale,
          onPress: () => handleScaleSelect(option.id),
          disabled,
        })),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScale, disabled]);

  const trigger = useMemo(
    () => (
      <View
        className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Ionicons name='search-outline' size={24} color='white' />
      </View>
    ),
    [disabled],
  );

  // Hide on TV platforms
  if (Platform.isTV) return null;

  return (
    <PlatformDropdown
      title='Scale Factor'
      groups={optionGroups}
      trigger={trigger}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};
