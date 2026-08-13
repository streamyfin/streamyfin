// Web (desktop) variant: the native SwiftUI glass poster is tvOS 26+ only.
// Desktop renders the same information with plain views — image, rounded
// corners, progress bar and watched tick — minus the glass material.
import { Image } from "expo-image";
import { View } from "react-native";
import type { GlassPosterViewProps } from "./src/GlassPoster.types";

export const isGlassEffectAvailable = () => false;

const GlassPosterView: React.FC<GlassPosterViewProps> = ({
  imageUrl,
  aspectRatio,
  cornerRadius,
  progress,
  showWatchedIndicator,
  width,
  style,
  onLoad,
  onError,
}) => (
  <View
    style={[
      {
        width,
        aspectRatio,
        borderRadius: cornerRadius,
        overflow: "hidden",
        backgroundColor: "#171717",
      },
      style,
    ]}
  >
    {imageUrl ? (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: "100%", height: "100%" }}
        contentFit='cover'
        cachePolicy='memory-disk'
        onLoad={() => onLoad?.()}
        onError={(e) => onError?.(String(e))}
      />
    ) : null}

    {showWatchedIndicator ? (
      <View
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: "#9334E9",
        }}
      />
    ) : null}

    {progress > 0 ? (
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: "rgba(255,255,255,0.25)",
        }}
      >
        <View
          style={{
            width: `${Math.max(0, Math.min(100, progress))}%`,
            height: "100%",
            backgroundColor: "#9334E9",
          }}
        />
      </View>
    ) : null}
  </View>
);

export default GlassPosterView;
export { GlassPosterView };
export const GlassPosterModule = {};
export * from "./src/GlassPoster.types";
