import type { StyleProp, ViewStyle } from "react-native";

export interface GlassPosterViewProps {
  /** URL of the image to display */
  imageUrl: string | null;
  /** Aspect ratio of the poster (width/height). Default: 10/15 for portrait, 16/9 for landscape */
  aspectRatio: number;
  /** Corner radius in points. Default: 24 */
  cornerRadius: number;
  /** Progress percentage (0-100). Shows progress bar at bottom when > 0 */
  progress: number;
  /** Whether to show the watched checkmark indicator */
  showWatchedIndicator: boolean;
  /** Whether the poster is currently focused (for scale animation) */
  isFocused: boolean;
  /** Width of the poster in points. Required for proper sizing. */
  width: number;
  /** Style for the container view */
  style?: StyleProp<ViewStyle>;
  /** Called when the image loads successfully */
  onLoad?: () => void;
  /** Called when image loading fails */
  onError?: (error: string) => void;
}

export type GlassPosterModuleEvents = Record<string, never>;
