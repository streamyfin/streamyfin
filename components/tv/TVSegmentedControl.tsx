import { View } from "react-native";
import { scaleSize } from "@/utils/scaleSize";
import { TVFilterButton } from "./TVFilterButton";

export interface TVSegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface TVSegmentedControlProps<T extends string> {
  options: TVSegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** When true, the currently selected option receives initial TV focus. */
  hasTVPreferredFocus?: boolean;
}

/**
 * Focusable TV view switcher. Built from `TVFilterButton`s, the same way
 * `TVSearchTabBadges` toggles Library | Discover, so every TV toggle shares
 * one look and focus behaviour. Only the selected option takes preferred
 * focus, so returning to the screen lands on the active view.
 */
export function TVSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  hasTVPreferredFocus = false,
}: TVSegmentedControlProps<T>) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: scaleSize(16),
        // The focused button scales up; don't clip it.
        overflow: "visible",
        marginBottom: scaleSize(24),
      }}
    >
      {options.map((option) => (
        <TVFilterButton
          key={option.value}
          label=''
          value={option.label}
          hasActiveFilter={value === option.value}
          onPress={() => onChange(option.value)}
          hasTVPreferredFocus={hasTVPreferredFocus && value === option.value}
        />
      ))}
    </View>
  );
}
