// Centralized helpers for navigation-related logic to reduce duplication and Sonar code smells.

// Navigation tab constants to eliminate string literal duplication
export const TAB_ROUTES = {
  HOME: "(home)",
  SEARCH: "(search)",
  LIBRARIES: "(libraries)",
  FAVORITES: "(favorites)",
} as const;

/**
 * Derive current tab/root segment from expo-router segments array.
 * Falls back gracefully to the last available segment or HOME.
 */
export function getCurrentTab(segments: readonly string[]): string {
  if (!segments || segments.length === 0) return TAB_ROUTES.HOME;
  if (segments.length > 2) return segments[2] || TAB_ROUTES.HOME;
  return segments[segments.length - 1] || TAB_ROUTES.HOME;
}
