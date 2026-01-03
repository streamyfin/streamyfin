import { Stack, useLocalSearchParams } from "expo-router";
import { Platform } from "react-native";
import { HeaderBackButton } from "@/components/common/HeaderBackButton";

const Layout = () => {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: Platform.OS === "ios",
        headerShadowVisible: false,
        headerBlurEffect: "none",
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen
        name='index'
        initialParams={{ libraryId }}
        options={{ title: "" }}
      />
    </Stack>
  );
};

export default Layout;
