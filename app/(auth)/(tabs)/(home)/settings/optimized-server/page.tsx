import { Text } from "@/components/common/Text";
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
import DisabledSetting from "@/components/settings/DisabledSetting";

export default function page() {
  const navigation = useNavigation();

  const { t } = useTranslation();

  const [api] = useAtom(apiAtom);
  const [settings, updateSettings, pluginSettings] = useSettings();

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
        url: updatedUrl,
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

  useEffect(() => {
    if (!pluginSettings?.optimizedVersionsServerUrl?.locked) {
      navigation.setOptions({
        title: t("home.settings.downloads.optimized_server"),
        headerRight: () =>
          saveMutation.isPending ? (
            <ActivityIndicator size={"small"} color={"white"} />
          ) : (
            <TouchableOpacity
              onPress={() => onSave(optimizedVersionsServerUrl)}
            >
              <Text className="text-blue-500">
                {t("home.settings.downloads.save_button")}
              </Text>
            </TouchableOpacity>
          ),
      });
    }
  }, [navigation, optimizedVersionsServerUrl, saveMutation.isPending]);

  return (
    <DisabledSetting
      disabled={pluginSettings?.optimizedVersionsServerUrl?.locked === true}
      className="p-4"
    >
      <OptimizedServerForm
        value={optimizedVersionsServerUrl}
        onChangeValue={setOptimizedVersionsServerUrl}
      />
    </DisabledSetting>
  );
}
