import { requireNativeView, requireOptionalNativeModule } from "expo";
import * as React from "react";
import { Platform } from "react-native";

import type { HeroCarouselViewProps } from "./HeroCarousel.types";

// The native view takes a single JSON string prop carrying the slides and
// the image headers. Typed object/array props are applied natively with
// `try? prop.set(...)`, so a conversion failure is swallowed and the view
// silently renders empty; a string prop has no such failure mode, and the
// same payload is what both native views parse.
type NativeProps = {
  payload: string;
  onItemPress?: HeroCarouselViewProps["onItemPress"];
  onFilterToggle?: HeroCarouselViewProps["onFilterToggle"];
  style?: HeroCarouselViewProps["style"];
};

// The native side is a pure presentational view: JS passes prebuilt data
// (image URLs, localized badge strings) and receives item ids back, which is
// how SwiftUI and Jetpack Compose can both render it under the same
// "HeroCarousel" name. Phones/tablets only — the TV home has its own hero.
let NativeHeroCarouselView: React.ComponentType<NativeProps> | null = null;

// requireOptionalNativeModule returns null instead of throwing when the
// module isn't in this binary (an old build, or Expo Go).
if (!Platform.isTV && requireOptionalNativeModule("HeroCarousel")) {
  try {
    NativeHeroCarouselView = requireNativeView<NativeProps>("HeroCarousel");
  } catch {
    // View manager missing despite the module being registered.
  }
}

/**
 * HeroCarouselView — native paged hero carousel.
 *
 * iOS 17+: SwiftUI paged ScrollView with interactive parallax and glass
 * info panels. iOS 15/16: paged TabView fallback with the same card design.
 * Android: Jetpack Compose `HorizontalPager` with the same card design; the
 * glass panels need Android 12+ and flatten to a solid tint below it.
 * Platforms without a native implementation render nothing.
 */
const HeroCarouselView: React.FC<HeroCarouselViewProps> = ({
  items,
  imageHeaders,
  filterSections,
  filterLabel,
  onItemPress,
  onFilterToggle,
  style,
}) => {
  const payload = React.useMemo(
    () =>
      JSON.stringify({
        items,
        imageHeaders: imageHeaders ?? {},
        filterSections: filterSections ?? [],
        filterLabel: filterLabel ?? "",
      }),
    [items, imageHeaders, filterSections, filterLabel],
  );
  if (!NativeHeroCarouselView) {
    return null;
  }
  return (
    <NativeHeroCarouselView
      payload={payload}
      onItemPress={onItemPress}
      onFilterToggle={onFilterToggle}
      style={style}
    />
  );
};

export const isHeroCarouselAvailable = () => NativeHeroCarouselView != null;

export default HeroCarouselView;
