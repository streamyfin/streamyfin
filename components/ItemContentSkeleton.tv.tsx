import React from "react";
import { Dimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ItemContentSkeletonTV: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        paddingTop: insets.top + 140,
        paddingHorizontal: insets.left + 80,
      }}
    >
      {/* Left side - Content placeholders */}
      <View style={{ flex: 1 }}>
        {/* Logo placeholder */}
        <View
          style={{
            height: 150,
            width: "80%",
            backgroundColor: "#1a1a1a",
            borderRadius: 8,
            marginBottom: 24,
          }}
        />

        {/* Metadata badges row */}
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              height: 24,
              width: 60,
              backgroundColor: "#1a1a1a",
              borderRadius: 4,
            }}
          />
          <View
            style={{
              height: 24,
              width: 80,
              backgroundColor: "#1a1a1a",
              borderRadius: 4,
            }}
          />
          <View
            style={{
              height: 24,
              width: 50,
              backgroundColor: "#1a1a1a",
              borderRadius: 4,
            }}
          />
        </View>

        {/* Genres placeholder */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 24,
          }}
        >
          <View
            style={{
              height: 28,
              width: 80,
              backgroundColor: "#1a1a1a",
              borderRadius: 14,
            }}
          />
          <View
            style={{
              height: 28,
              width: 100,
              backgroundColor: "#1a1a1a",
              borderRadius: 14,
            }}
          />
          <View
            style={{
              height: 28,
              width: 70,
              backgroundColor: "#1a1a1a",
              borderRadius: 14,
            }}
          />
        </View>

        {/* Overview placeholder */}
        <View
          style={{
            maxWidth: SCREEN_WIDTH * 0.45,
            marginBottom: 32,
          }}
        >
          <View
            style={{
              height: 18,
              width: "100%",
              backgroundColor: "#1a1a1a",
              borderRadius: 4,
              marginBottom: 8,
            }}
          />
          <View
            style={{
              height: 18,
              width: "90%",
              backgroundColor: "#1a1a1a",
              borderRadius: 4,
              marginBottom: 8,
            }}
          />
          <View
            style={{
              height: 18,
              width: "75%",
              backgroundColor: "#1a1a1a",
              borderRadius: 4,
            }}
          />
        </View>

        {/* Play button placeholder */}
        <View
          style={{
            height: 56,
            width: 180,
            backgroundColor: "#1a1a1a",
            borderRadius: 12,
          }}
        />
      </View>

      {/* Right side - Poster placeholder */}
      <View
        style={{
          width: SCREEN_WIDTH * 0.22,
          marginLeft: 50,
        }}
      >
        <View
          style={{
            aspectRatio: 2 / 3,
            borderRadius: 16,
            backgroundColor: "#1a1a1a",
          }}
        />
      </View>
    </View>
  );
};
