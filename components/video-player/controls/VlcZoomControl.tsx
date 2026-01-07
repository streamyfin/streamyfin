import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Platform, View } from "react-native";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";
import { useHaptic } from "@/hooks/useHaptic";
import { ICON_SIZES } from "./constants";

export type ScaleFactor = 0 | 0.25 | 0.5 | 0.75 | 1.0 | 1.25 | 1.5 | 2.0;

interface VlcZoomControlProps {
  currentScale: ScaleFactor;
  onScaleChange: (scale: ScaleFactor) => void;
  disabled?: boolean;
}

interface ScaleOption {
  id: ScaleFactor;
  label: string;
  description: string;
}

const SCALE_OPTIONS: ScaleOption[] = [
  {
    id: 0,
    label: "Fit",
    description: "Fit video to screen",
  },
  {
    id: 0.25,
    label: "25%",
    description: "Quarter size",
  },
  {
    id: 0.5,
    label: "50%",
    description: "Half size",
  },
  {
    id: 0.75,
    label: "75%",
    description: "Three quarters",
  },
  {
    id: 1.0,
    label: "100%",
    description: "Original video size",
  },
  {
    id: 1.25,
    label: "125%",
    description: "Slight zoom",
  },
  {
    id: 1.5,
    label: "150%",
    description: "Medium zoom",
  },
  {
    id: 2.0,
    label: "200%",
    description: "Maximum zoom",
  },
];

export const VlcZoomControl: React.FC<VlcZoomControlProps> = ({
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
        options: SCALE_OPTIONS.map((option) => ({
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
        <Ionicons name='scan-outline' size={ICON_SIZES.HEADER} color='white' />
      </View>
    ),
    [disabled],
  );

  // Hide on TV platforms
  if (Platform.isTV) return null;

  return (
    <PlatformDropdown
      title='Zoom'
      groups={optionGroups}
      trigger={trigger}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};
