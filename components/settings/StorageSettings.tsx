import { useHaptic } from "@/hooks/useHaptic";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

export const StorageSettings = () => {
  const { t } = useTranslation();
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");

  return (
    <View>
      {/* <View className="flex flex-col gap-y-1">
        <View className="flex flex-row items-center justify-between">
          <Text className="">{t("home.settings.storage.storage_title")}</Text>
          {size && (
            <Text className="text-neutral-500">
              {t("home.settings.storage.size_used", {
                used: Number(size.total - size.remaining).bytesToReadable(),
                total: size.total?.bytesToReadable(),
              })}
            </Text>
          )}
        </View>
        <View className="h-3 w-full bg-gray-100/10 rounded-md overflow-hidden flex flex-row">
          {size && (
            <>
              <View
                style={{
                  width: `${(size.app / size.total) * 100}%`,
                  backgroundColor: "rgb(147 51 234)",
                }}
              />
              <View
                style={{
                  width: `${
                    ((size.total - size.remaining - size.app) / size.total) *
                    100
                  }%`,
                  backgroundColor: "rgb(192 132 252)",
                }}
              />
            </>
          )}
        </View>
        <View className="flex flex-row gap-x-2">
          {size && (
            <>
              <View className="flex flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-purple-600 mr-1"></View>
                <Text className="text-white text-xs">
                  {t("home.settings.storage.app_usage", {
                    usedSpace: calculatePercentage(size.app, size.total),
                  })}
                </Text>
              </View>
              <View className="flex flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-purple-400 mr-1"></View>
                <Text className="text-white text-xs">
                  {t("home.settings.storage.device_usage", {
                    availableSpace: calculatePercentage(
                      size.total - size.remaining - size.app,
                      size.total
                    ),
                  })}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
      <ListGroup>
        <ListItem
          textColor="red"
          onPress={onDeleteClicked}
          title={t("home.settings.storage.delete_all_downloaded_files")}
        />
      </ListGroup> */}
    </View>
  );
};
