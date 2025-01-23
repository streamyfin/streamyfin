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

export default function page() {
  const navigation = useNavigation();

  const [api] = useAtom(apiAtom);
  const [settings, updateSettings] = useSettings();

  const [optimizedVersionsServerUrl, setOptimizedVersionsServerUrl] =
    useState<string>(settings?.optimizedVersionsServerUrl || "");

  const saveMutation = useMutation({
    mutationFn: async (newVal: string) => {
      if (newVal.length === 0 || !newVal.startsWith("http")) {
        toast.error("Invalid URL");
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
        toast.success("Connected");
      } else {
        toast.error("Could not connect");
      }
    },
    onError: () => {
      toast.error("Could not connect");
    },
  });

  const onSave = (newVal: string) => {
    saveMutation.mutate(newVal);
  };

  useEffect(() => {
    navigation.setOptions({
      title: "Optimized Server",
      headerRight: () =>
        saveMutation.isPending ? (
          <ActivityIndicator size={"small"} color={"white"} />
        ) : (
          <TouchableOpacity onPress={() => onSave(optimizedVersionsServerUrl)}>
            <Text className="text-blue-500">Save</Text>
          </TouchableOpacity>
        ),
    });
  }, [navigation, optimizedVersionsServerUrl, saveMutation.isPending]);

  return (
    <View className="p-4">
      <OptimizedServerForm
        value={optimizedVersionsServerUrl}
        onChangeValue={setOptimizedVersionsServerUrl}
      />
    </View>
  );
}
