import { Text } from "@/components/common/Text";
import { JellyseerrSettings } from "@/components/settings/Jellyseerr";
import { OptimizedServerForm } from "@/components/settings/OptimizedServerForm";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getOrSetDeviceId } from "@/utils/device";
import { getStatistics } from "@/utils/optimize-server";
import { useMutation } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";
import { useTranslation } from "react-i18next";

export default function page() {
  const navigation = useNavigation();

  const { t } = useTranslation();

  const [api] = useAtom(apiAtom);
  const [settings, updateSettings] = useSettings();

  const [optimizedVersionsServerUrl, setOptimizedVersionsServerUrl] =
    useState<string>(settings?.optimizedVersionsServerUrl || "");

  const saveMutation = useMutation({
    mutationFn: async (newVal: string) => {
      if (newVal.length === 0 || !newVal.startsWith("http")) {
        toast.error(t("home.settings.toasts.invalid_url"));
        return;
      }

      const updatedUrl = newVal.endsWith("/") ? newVal : newVal + "/";

      updateSettings({
        optimizedVersionsServerUrl: updatedUrl,
      });

      return await getStatistics({
        url: settings?.optimizedVersionsServerUrl,
        authHeader: api?.accessToken,
        deviceId: getOrSetDeviceId(),
      });
    },
    onSuccess: (data) => {
      if (data) {
        toast.success(t("home.settings.toasts.connected"));
      } else {
        toast.error(t("home.settings.toasts.could_not_connect"));
      }
    },
    onError: () => {
      toast.error(t("home.settings.toasts.could_not_connect"));
    },
  });

  const onSave = (newVal: string) => {
    saveMutation.mutate(newVal);
  };

  // useEffect(() => {
  //   navigation.setOptions({
  //     title: "Optimized Server",
  //     headerRight: () =>
  //       saveMutation.isPending ? (
  //         <ActivityIndicator size={"small"} color={"white"} />
  //       ) : (
  //         <TouchableOpacity onPress={() => onSave(optimizedVersionsServerUrl)}>
  //           <Text className="text-blue-500">Save</Text>
  //         </TouchableOpacity>
  //       ),
  //   });
  // }, [navigation, optimizedVersionsServerUrl, saveMutation.isPending]);

  return (
    <View className="p-4">
      <JellyseerrSettings />
    </View>
  );
}
