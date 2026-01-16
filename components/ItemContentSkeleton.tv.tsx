import React from "react";
import { Dimensions, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ItemContentSkeletonTV: React.FC = () => {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        paddingTop: 180,
        paddingHorizontal: 160,
      }}
    >
      {/* Left side - Poster placeholder */}
      <View
        style={{
          width: SCREEN_WIDTH * 0.22,
          marginRight: 50,
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

      {/* Right side - Content placeholders */}
      <View style={{ flex: 1, justifyContent: "center" }}>
        {/* Logo/Title placeholder */}
        <View
          style={{
            height: 80,
            width: "60%",
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
    </View>
  );
};
