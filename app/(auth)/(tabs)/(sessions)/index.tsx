import { Text } from "@/components/common/Text";
import { useSessions } from "@/hooks/useSessions";
import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Loader } from "@/components/Loader";
import { Alert } from "react-native";

export default function index() {
  const { sessions, isLoading } = useSessions({});
  const { t } = useTranslation();
  //Alert.alert(sessions);
  Alert.alert(JSON.stringify(sessions));
  if (isLoading)
    return (
      <View className="justify-center items-center h-full">
        <Loader />
      </View>
    );

  if (!sessions)
    return (
      <View className="h-full w-full flex justify-center items-center">
        <Text className="text-lg text-neutral-500">{t("sessions.no_active_sessions")}</Text>
      </View>
    );

  return (
    <FlashList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: 17,
        paddingHorizontal: 17,
        paddingBottom: 150,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      data={sessions}
      renderItem={({ item }) => {
        <Text>Yo</Text> 
      }}
      //renderItem={({ item }) => <LibraryItemCard library={item} />}
      keyExtractor={(item) => item.Id || ""}
      estimatedItemSize={200}
    />
  );
}
