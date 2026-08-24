import React from "react";
import { Dimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scaleSize } from "@/utils/scaleSize";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ItemContentSkeletonTV: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        paddingTop: insets.top + scaleSize(140),
        paddingHorizontal: insets.left + scaleSize(80),
      }}
    >
      {/* Left side - Content placeholders */}
      <View style={{ flex: 1 }}>
        {/* Logo placeholder */}
        <View
          style={{
            height: scaleSize(150),
            width: "80%",
            backgroundColor: "#1a1a1a",
            borderRadius: scaleSize(8),
            marginBottom: scaleSize(24),
          }}
        />

        {/* Metadata badges row */}
        <View
          style={{
            flexDirection: "row",
            gap: scaleSize(12),
            marginBottom: scaleSize(20),
          }}
        >
          <View
            style={{
              height: scaleSize(24),
              width: scaleSize(60),
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(4),
            }}
          />
          <View
            style={{
              height: scaleSize(24),
              width: scaleSize(80),
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(4),
            }}
          />
          <View
            style={{
              height: scaleSize(24),
              width: scaleSize(50),
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(4),
            }}
          />
        </View>

        {/* Genres placeholder */}
        <View
          style={{
            flexDirection: "row",
            gap: scaleSize(8),
            marginBottom: scaleSize(24),
          }}
        >
          <View
            style={{
              height: scaleSize(28),
              width: scaleSize(80),
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(14),
            }}
          />
          <View
            style={{
              height: scaleSize(28),
              width: scaleSize(100),
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(14),
            }}
          />
          <View
            style={{
              height: scaleSize(28),
              width: scaleSize(70),
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(14),
            }}
          />
        </View>

        {/* Overview placeholder - the real layout renders the overview above
            the action row, so keep the same order here to avoid a shift on load */}
        <View
          style={{
            maxWidth: SCREEN_WIDTH * 0.45,
            marginBottom: scaleSize(24),
          }}
        >
          <View
            style={{
              height: scaleSize(18),
              width: "100%",
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(4),
              marginBottom: scaleSize(8),
            }}
          />
          <View
            style={{
              height: scaleSize(18),
              width: "90%",
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(4),
              marginBottom: scaleSize(8),
            }}
          />
          <View
            style={{
              height: scaleSize(18),
              width: "75%",
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(4),
            }}
          />
        </View>

        {/* Action buttons placeholder - Play + favorite, matching the real
            layout's action row that sits below the overview */}
        <View
          style={{
            flexDirection: "row",
            gap: scaleSize(16),
          }}
        >
          <View
            style={{
              height: scaleSize(56),
              width: scaleSize(180),
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(12),
            }}
          />
          <View
            style={{
              height: scaleSize(56),
              width: scaleSize(56),
              backgroundColor: "#1a1a1a",
              borderRadius: scaleSize(12),
            }}
          />
        </View>
      </View>

      {/* Right side - Poster placeholder */}
      <View
        style={{
          width: SCREEN_WIDTH * 0.22,
          marginLeft: scaleSize(50),
        }}
      >
        <View
          style={{
            aspectRatio: 2 / 3,
            borderRadius: scaleSize(16),
            backgroundColor: "#1a1a1a",
          }}
        />
      </View>
    </View>
  );
};
