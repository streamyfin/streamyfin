import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, TouchableOpacity } from "react-native";
import { Text } from "@/components/common/Text";
import { FilterSheet } from "@/components/filters/FilterSheet";
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
  const [open, setOpen] = useState(false);

  // Hide on TV platforms
  if (Platform.isTV) return null;

  const handleScaleSelect = (scale: ScaleFactor) => {
    onScaleChange(scale);
    lightHapticFeedback();
  };

  const currentOption = SCALE_FACTOR_OPTIONS.find(
    (option) => option.id === currentScale,
  );

  return (
    <>
      <TouchableOpacity
        disabled={disabled}
        className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
        style={{ opacity: disabled ? 0.5 : 1 }}
        onPress={() => setOpen(true)}
      >
        <Ionicons name='search-outline' size={24} color='white' />
      </TouchableOpacity>

      <FilterSheet
        open={open}
        setOpen={setOpen}
        title='Scale Factor'
        data={SCALE_FACTOR_OPTIONS}
        values={currentOption ? [currentOption] : []}
        multiple={false}
        searchFilter={(item, query) => {
          const option = item as ScaleFactorOption;
          return (
            option.label.toLowerCase().includes(query.toLowerCase()) ||
            option.description.toLowerCase().includes(query.toLowerCase())
          );
        }}
        renderItemLabel={(item) => {
          const option = item as ScaleFactorOption;
          return <Text>{option.label}</Text>;
        }}
        set={(vals) => {
          const chosen = vals[0] as ScaleFactorOption | undefined;
          if (chosen) {
            handleScaleSelect(chosen.id);
          }
        }}
      />
    </>
  );
};
