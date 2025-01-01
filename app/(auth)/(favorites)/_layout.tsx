import { Chromecast } from "@/components/Chromecast";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Platform, TouchableOpacity, View } from "react-native";
import { Menu, Divider, Provider } from "react-native-paper";
import {useState} from "react";


export default function IndexLayout() {
  const router = useRouter();

  return (
    <Provider>
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerLargeTitle: true,
          headerTitle: "Favorites",
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
          headerRight: () => (
            <View className="flex flex-row items-center space-x-2">
              <Chromecast />
            </View>
          ),
        }}
      />
    </Stack>
    </Provider>
  );
}
