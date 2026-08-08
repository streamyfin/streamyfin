import { Ionicons } from "@expo/vector-icons";
import type {
  TaskInfo,
  TaskState,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getScheduledTasksApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import ProgressCircle from "@/components/ProgressCircle";
import { apiAtom } from "@/providers/JellyfinProvider";

interface TaskCardProps {
  task: TaskInfo;
}

const TaskCard: React.FC<TaskCardProps> = ({ task }) => {
  const { t } = useTranslation();

  const getStateColor = (state: TaskState | undefined): string => {
    switch (state) {
      case "Running":
        return "#22c55e"; // green-500
      case "Cancelling":
        return "#f59e0b"; // amber-500
      default:
        return "#6b7280"; // gray-500
    }
  };

  const getStateIcon = (
    state: TaskState | undefined,
  ): keyof typeof Ionicons.glyphMap => {
    switch (state) {
      case "Running":
        return "play-circle";
      case "Cancelling":
        return "stop-circle";
      default:
        return "pause-circle";
    }
  };

  const formatLastRun = (lastRun: string | null | undefined): string => {
    if (!lastRun) return t("home.admin.tasks.never_run");

    try {
      const date = new Date(lastRun);
      return date.toLocaleString();
    } catch {
      return t("home.admin.tasks.invalid_date");
    }
  };

  return (
    <View className='bg-neutral-900 rounded-xl p-4 mb-3 border border-neutral-800'>
      {/* Header with name and status */}
      <View className='flex-row items-center justify-between mb-3'>
        <View className='flex-1 mr-3'>
          <Text className='text-lg font-semibold text-white' numberOfLines={2}>
            {task.Name || t("home.admin.tasks.unnamed_task")}
          </Text>
          {task.Description && (
            <Text className='text-sm text-neutral-400 mt-1' numberOfLines={2}>
              {task.Description}
            </Text>
          )}
        </View>

        <View className='flex-row items-center space-x-2'>
          <Badge
            text={task.State || "Unknown"}
            variant='gray'
            iconLeft={
              <Ionicons
                name={getStateIcon(task.State)}
                size={12}
                color={getStateColor(task.State)}
              />
            }
          />
        </View>
      </View>

      {/* Progress indicator for running tasks */}
      {task.State === "Running" && task.CurrentProgressPercentage != null && (
        <View className='flex-row items-center mb-3'>
          <ProgressCircle
            size={24}
            fill={task.CurrentProgressPercentage}
            width={3}
            tintColor='#22c55e'
            backgroundColor='#374151'
          />
          <Text className='ml-3 text-sm text-neutral-300'>
            {task.CurrentProgressPercentage.toFixed(1)}%{" "}
            {t("home.admin.tasks.complete")}
          </Text>
        </View>
      )}

      {/* Task metadata */}
      <View className='flex-row flex-wrap gap-x-4 gap-y-2'>
        {task.Category && (
          <View className='flex-row items-center'>
            <Ionicons name='folder-outline' size={14} color='#9ca3af' />
            <Text className='ml-1 text-xs text-neutral-400'>
              {task.Category}
            </Text>
          </View>
        )}

        {task.LastExecutionResult?.StartTimeUtc && (
          <View className='flex-row items-center'>
            <Ionicons name='time-outline' size={14} color='#9ca3af' />
            <Text className='ml-1 text-xs text-neutral-400'>
              {formatLastRun(task.LastExecutionResult.StartTimeUtc)}
            </Text>
          </View>
        )}

        {task.LastExecutionResult?.Status && (
          <View className='flex-row items-center'>
            <Ionicons
              name={
                task.LastExecutionResult.Status === "Completed"
                  ? "checkmark-circle-outline"
                  : "alert-circle-outline"
              }
              size={14}
              color={
                task.LastExecutionResult.Status === "Completed"
                  ? "#22c55e"
                  : "#ef4444"
              }
            />
            <Text className='ml-1 text-xs text-neutral-400'>
              {task.LastExecutionResult.Status}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default function TasksPage() {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const {
    data: allTasks,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["scheduledTasks"],
    queryFn: async () => {
      if (!api) return [];
      const systemApi = getScheduledTasksApi(api);
      const response = await systemApi.getTasks();
      return response.data || [];
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    enabled: !!api,
  });

  // Filter to show running tasks and recently completed ones
  const relevantTasks = React.useMemo(() => {
    if (!allTasks) return [];

    return allTasks.filter((task: TaskInfo) => {
      // Always show running or cancelling tasks
      if (task.State === "Running" || task.State === "Cancelling") {
        return true;
      }

      // Show recently completed tasks (within last hour)
      if (task.LastExecutionResult?.EndTimeUtc) {
        const endTime = new Date(task.LastExecutionResult.EndTimeUtc);
        const now = new Date();
        const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        return endTime > hourAgo;
      }

      return false;
    });
  }, [allTasks]);

  const runningTasksCount = React.useMemo(() => {
    return (
      relevantTasks?.filter((task: TaskInfo) => task.State === "Running")
        .length || 0
    );
  }, [relevantTasks]);

  if (isLoading) {
    return (
      <View
        className='flex-1 items-center justify-center'
        style={{ paddingTop: insets.top }}
      >
        <Loader />
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      {/* Header */}
      <View className='flex-row items-center justify-between p-4 pb-2'>
        <View>
          <Text className='text-xl font-bold text-white'>
            {t("home.admin.running_tasks")}
          </Text>
          <Text className='text-sm text-neutral-400'>
            {runningTasksCount > 0
              ? t("home.admin.tasks.running_count", {
                  count: runningTasksCount,
                })
              : t("home.admin.tasks.no_running_tasks")}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          className='p-2 rounded-lg bg-neutral-800'
        >
          <Ionicons
            name='refresh'
            size={20}
            color='#ffffff'
            style={{
              transform: [{ rotate: isRefetching ? "180deg" : "0deg" }],
            }}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        className='flex-1 px-4'
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor='#ffffff'
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {relevantTasks && relevantTasks.length > 0 ? (
          relevantTasks.map((task: TaskInfo) => (
            <TaskCard key={task.Id || task.Name} task={task} />
          ))
        ) : (
          <View className='flex-1 items-center justify-center py-12'>
            <Ionicons
              name='checkmark-circle-outline'
              size={64}
              color='#6b7280'
            />
            <Text className='text-lg font-medium text-neutral-400 mt-4 text-center'>
              {t("home.admin.tasks.no_active_tasks")}
            </Text>
            <Text className='text-sm text-neutral-500 mt-2 text-center px-8'>
              {t("home.admin.tasks.no_active_tasks_description")}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
