import { Platform, useWindowDimensions } from "react-native";

/**
 * Physical size constants
 * In React Native, dp (density-independent pixels) normalize to ~160 dpi baseline
 * Formula: dp = cm * (160 / 2.54) ≈ cm * 63
 */
const CM_TO_DP = 160 / 2.54; // ~63 dp per cm

/**
 * Default physical sizes for different device types
 * - Mobile: 1.5cm is comfortable for touch targets at arm's length
 * - TV: Items need to be visible from 2-3m viewing distance, use column count instead
 */
const DEFAULT_MIN_SIZE_CM_MOBILE = 1.5;
const DEFAULT_TV_COLUMNS = 6; // Fixed column count for TV (better UX than physical size)

/**
 * Calculate grid columns to ensure minimum physical item size
 *
 * For mobile devices: Uses physical size calculation (default 1.5cm)
 * For TV: Uses fixed column count (physical size doesn't work well with viewing distance)
 *
 * @param minPhysicalSizeCm - Minimum item size in centimeters (mobile only, default 1.5cm)
 * @param tvColumns - Fixed column count for TV (default 6)
 * @param horizontalPadding - Total horizontal padding (left + right)
 * @param gap - Gap between items
 * @param extraPadding - Additional padding (e.g., for alphabet scroll bar)
 * @returns { columns, itemSize } - Number of columns and calculated item size in dp
 */
export function useGridColumns({
  minPhysicalSizeCm = DEFAULT_MIN_SIZE_CM_MOBILE,
  tvColumns = DEFAULT_TV_COLUMNS,
  horizontalPadding = 32, // 16px on each side
  gap = 8,
  extraPadding = 0,
}: {
  minPhysicalSizeCm?: number;
  tvColumns?: number;
  horizontalPadding?: number;
  gap?: number;
  extraPadding?: number;
} = {}) {
  const { width: screenWidth } = useWindowDimensions();

  // Calculate available width
  const availableWidth = screenWidth - horizontalPadding - extraPadding;

  let columns: number;

  if (Platform.isTV) {
    // TV: Use fixed column count (physical size doesn't translate well to TV viewing distance)
    columns = tvColumns;
  } else {
    // Mobile: Calculate based on physical size
    const minSizeDp = minPhysicalSizeCm * CM_TO_DP;

    // Calculate maximum columns that fit while respecting minimum size
    // Each column needs: itemSize + gap (except last column)
    // So: columns * itemSize + (columns - 1) * gap <= availableWidth
    // Solving for columns: columns <= (availableWidth + gap) / (minSizeDp + gap)
    const maxColumns = Math.floor((availableWidth + gap) / (minSizeDp + gap));
    columns = Math.max(1, maxColumns);
  }

  // Calculate actual item size to fill the available width evenly
  // columns * itemSize + (columns - 1) * gap = availableWidth
  // itemSize = (availableWidth - (columns - 1) * gap) / columns
  const itemSize = Math.floor((availableWidth - (columns - 1) * gap) / columns);

  return { columns, itemSize };
}
