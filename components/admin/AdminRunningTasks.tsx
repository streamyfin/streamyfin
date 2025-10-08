import { Ionicons } from "@expo/vector-icons";
import type { TaskInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getScheduledTasksApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import React from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { apiAtom } from "@/providers/JellyfinProvider";

interface Props extends ViewProps {}

export const AdminRunningTasks: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
  const router = useRouter();

  const { data: allTasks, isLoading } = useQuery({
    queryKey: ["scheduledTasksPreview"],
    queryFn: async () => {
      if (!api) return [];
      const systemApi = getScheduledTasksApi(api);
      const response = await systemApi.getTasks();
      return response.data || [];
    },
    refetchInterval: 30000, // Check every 30 seconds for preview
    enabled: !!api,
  });

  // Count running tasks for preview
  const runningTasksCount = React.useMemo(() => {
    if (!allTasks) return 0;
    return allTasks.filter((task: TaskInfo) => task.State === "Running").length;
  }, [allTasks]);

  const handlePress = () => {
    router.push("/(auth)/admin/tasks/page");
  };

  if (isLoading) {
    return (
      <View
        {...props}
        className='bg-neutral-900 rounded-xl p-4 border border-neutral-800'
      >
        <Loader />
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      className='bg-neutral-900 rounded-xl p-4 border border-neutral-800 flex-row items-center justify-between'
    >
      <View className='flex-1'>
        <Text className='text-lg font-semibold text-white mb-1'>
          {t("home.admin.running_tasks")}
        </Text>
        <Text className='text-sm text-neutral-400'>
          {runningTasksCount > 0
            ? t("home.admin.tasks.running_count", { count: runningTasksCount })
            : t("home.admin.tasks.no_running_tasks")}
        </Text>
      </View>

      <View className='flex-row items-center'>
        {runningTasksCount > 0 && (
          <View className='bg-green-600 rounded-full w-3 h-3 mr-3' />
        )}
        <Ionicons name='chevron-forward' size={20} color='#9ca3af' />
      </View>
    </TouchableOpacity>
  );
};
