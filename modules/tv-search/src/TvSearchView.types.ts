import type { ViewProps } from "react-native";

export interface TvSearchTextChangeEvent {
  nativeEvent: { text: string };
}

export interface TvSearchViewProps extends ViewProps {
  /** Placeholder shown in the native search bar. */
  placeholder?: string;
  /** Fired as the user types in the native search bar. */
  onChangeText?: (event: TvSearchTextChangeEvent) => void;
}
