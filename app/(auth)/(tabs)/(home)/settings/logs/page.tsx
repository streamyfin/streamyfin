import { Text } from "@/components/common/Text";
import { useLog } from "@/utils/log";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

export default function page() {
  const { logs } = useLog();
  const { t } = useTranslation();

  return (
    <ScrollView className="p-4">
      <View className="flex flex-col space-y-2">
        {logs?.map((log, index) => (
          <View key={index} className="bg-neutral-900 rounded-xl p-3">
            <Text
              className={`
                  mb-1
              ${log.level === "INFO" && "text-blue-500"}
              ${log.level === "ERROR" && "text-red-500"}
                `}
            >
              {log.level}
            </Text>
            <Text uiTextView selectable className="text-xs">
              {log.message}
            </Text>
          </View>
        ))}
        {logs?.length === 0 && (
          <Text className="opacity-50">
            {t("home.settings.logs.no_logs_available")}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
