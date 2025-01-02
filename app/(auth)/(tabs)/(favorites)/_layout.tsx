import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { Stack } from "expo-router";
import { Platform } from "react-native";

export default function SearchLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerLargeTitle: true,
          headerTitle: "Favorites",
          headerLargeStyle: {
            backgroundColor: "black",
          },
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
    </Stack>
  );
}
