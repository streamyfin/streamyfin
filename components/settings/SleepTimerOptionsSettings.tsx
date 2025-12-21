import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Modal, TouchableOpacity, View } from "react-native";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import {
  type SleepTimerOption,
  SleepTimerType,
  useSettings,
} from "@/utils/atoms/settings";
import { formatDuration } from "@/utils/formatDuration";

export const SleepTimerOptionsSettings = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  // Modal states
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<
    "add_duration" | "add_episode" | "edit_duration" | "edit_episode"
  >("add_duration");
  const [inputValue, setInputValue] = useState("");
  const [editingOption, setEditingOption] = useState<SleepTimerOption | null>(
    null,
  );

  if (!settings) return null;

  const timerOptions = settings.jellysleepTimerOptions || [];

  // Check if an option already exists to prevent duplicates
  const optionExists = (type: SleepTimerType, value: number) => {
    return timerOptions.some((option) => {
      if (type === SleepTimerType.DURATION) {
        return (
          option.type === SleepTimerType.DURATION && option.duration === value
        );
      } else {
        return (
          option.type === SleepTimerType.EPISODE &&
          option.episodeCount === value
        );
      }
    });
  };

  const addNewOption = () => {
    Alert.alert(
      t("jellysleep.add_timer_option"),
      t("jellysleep.select_timer_type"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("jellysleep.duration_timer"),
          onPress: () => openModal("add_duration"),
        },
        {
          text: t("jellysleep.episode_timer"),
          onPress: () => openModal("add_episode"),
        },
      ],
    );
  };

  const openModal = (type: typeof modalType, option?: SleepTimerOption) => {
    setModalType(type);
    setEditingOption(option || null);
    setInputValue(
      type === "edit_duration"
        ? option?.duration?.toString() || ""
        : type === "edit_episode"
          ? option?.episodeCount?.toString() || ""
          : "",
    );
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setInputValue("");
    setEditingOption(null);
  };

  const handleSave = () => {
    const value = parseInt(inputValue, 10);
    if (value <= 0 || Number.isNaN(value)) {
      Alert.alert(t("common.error"), t("jellysleep.invalid_timer_value"), [
        { text: t("common.close") },
      ]);
      return;
    }

    // Check for duplicates when adding new options
    if (modalType === "add_duration") {
      if (optionExists(SleepTimerType.DURATION, value)) {
        Alert.alert(
          t("common.error"),
          t("jellysleep.duplicate_duration_timer", {
            minutes: value,
            minute: t("jellysleep.minute", { count: value }),
          }),
          [{ text: t("common.close") }],
        );
        return;
      }
      const newOption: SleepTimerOption = {
        id: `duration_${Date.now()}`,
        label: formatDuration(value, t),
        type: SleepTimerType.DURATION,
        duration: value,
      };
      updateSettings({
        jellysleepTimerOptions: [...timerOptions, newOption],
      });
    } else if (modalType === "add_episode") {
      if (optionExists(SleepTimerType.EPISODE, value)) {
        Alert.alert(
          t("common.error"),
          t("jellysleep.duplicate_episode_timer", {
            count: value,
            episode: t("jellysleep.episode", { count: value }),
          }),
          [{ text: t("common.close") }],
        );
        return;
      }
      const newOption: SleepTimerOption = {
        id: `episode_${Date.now()}`,
        label:
          value === 1
            ? t("jellysleep.after_this_episode")
            : t("jellysleep.after_episode", { count: value }),
        type: SleepTimerType.EPISODE,
        episodeCount: value,
      };
      updateSettings({
        jellysleepTimerOptions: [...timerOptions, newOption],
      });
    } else if (modalType === "edit_duration" && editingOption) {
      const updatedOptions = timerOptions.map((opt) =>
        opt.id === editingOption.id
          ? {
              ...opt,
              duration: value,
              label: formatDuration(value, t),
            }
          : opt,
      );
      updateSettings({
        jellysleepTimerOptions: updatedOptions,
      });
    } else if (modalType === "edit_episode" && editingOption) {
      const updatedOptions = timerOptions.map((opt) =>
        opt.id === editingOption.id
          ? {
              ...opt,
              episodeCount: value,
              label:
                value === 1
                  ? t("jellysleep.after_this_episode")
                  : t("jellysleep.after_episode", { count: value }),
            }
          : opt,
      );
      updateSettings({
        jellysleepTimerOptions: updatedOptions,
      });
    }
    closeModal();
  };

  const deleteOption = (optionId: string) => {
    Alert.alert(
      t("jellysleep.delete_timer_option"),
      t("jellysleep.delete_timer_option_confirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            const updatedOptions = timerOptions.filter(
              (option) => option.id !== optionId,
            );
            updateSettings({
              jellysleepTimerOptions: updatedOptions,
            });
          },
        },
      ],
    );
  };

  const editOption = (option: SleepTimerOption) => {
    if (option.type === SleepTimerType.DURATION) {
      openModal("edit_duration", option);
    } else if (option.type === SleepTimerType.EPISODE) {
      openModal("edit_episode", option);
    }
  };

  const moveOptionUp = (optionId: string) => {
    const currentIndex = timerOptions.findIndex((opt) => opt.id === optionId);
    if (currentIndex <= 0) return;

    const newOptions = [...timerOptions];
    const [movedOption] = newOptions.splice(currentIndex, 1);
    newOptions.splice(currentIndex - 1, 0, movedOption);

    updateSettings({
      jellysleepTimerOptions: newOptions,
    });
  };

  const moveOptionDown = (optionId: string) => {
    const currentIndex = timerOptions.findIndex((opt) => opt.id === optionId);
    if (currentIndex >= timerOptions.length - 1) return;

    const newOptions = [...timerOptions];
    const [movedOption] = newOptions.splice(currentIndex, 1);
    newOptions.splice(currentIndex + 1, 0, movedOption);

    updateSettings({
      jellysleepTimerOptions: newOptions,
    });
  };

  return (
    <View className='flex flex-col gap-y-4'>
      <ListGroup title={t("jellysleep.timer_options")}>
        {timerOptions.map((option, index) => (
          <ListItem key={option.id} title={option.label}>
            <View className='flex-row items-center gap-1'>
              {/* Reorder buttons */}
              <TouchableOpacity
                onPress={() => moveOptionUp(option.id)}
                className='p-1'
                disabled={index === 0}
              >
                <Ionicons
                  name='chevron-up'
                  size={16}
                  color={index === 0 ? "#4b5563" : "#6b7280"}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveOptionDown(option.id)}
                className='p-1'
                disabled={index === timerOptions.length - 1}
              >
                <Ionicons
                  name='chevron-down'
                  size={16}
                  color={
                    index === timerOptions.length - 1 ? "#4b5563" : "#6b7280"
                  }
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => editOption(option)}
                className='p-1'
              >
                <Ionicons name='pencil' size={16} color='#6b7280' />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deleteOption(option.id)}
                className='p-1'
              >
                <Ionicons name='trash' size={16} color='#ef4444' />
              </TouchableOpacity>
            </View>
          </ListItem>
        ))}

        <ListItem
          title={t("jellysleep.add_timer_option")}
          onPress={addNewOption}
        >
          <Ionicons name='add' size={20} color='#6b7280' />
        </ListItem>
      </ListGroup>

      <View className='p-4 bg-neutral-900 rounded-lg'>
        <Text className='text-neutral-300 text-sm mb-2'>
          {t("jellysleep.timer_options_description")}
        </Text>
        <Text className='text-neutral-300 text-sm'>
          {t("jellysleep.timer_options_info")}
        </Text>
      </View>

      {/* Input Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType='slide'
        onRequestClose={closeModal}
      >
        <View className='flex-1 justify-center items-center bg-black/50'>
          <View className='bg-neutral-800 rounded-lg p-6 mx-4 w-80'>
            <Text className='text-white text-lg font-semibold mb-4'>
              {modalType === "add_duration"
                ? t("jellysleep.duration_timer")
                : modalType === "add_episode"
                  ? t("jellysleep.episode_timer")
                  : modalType === "edit_duration"
                    ? t("jellysleep.edit_duration_timer")
                    : t("jellysleep.edit_episode_timer")}
            </Text>

            <Text className='text-neutral-300 text-sm mb-3'>
              {modalType.includes("duration")
                ? t("jellysleep.enter_minutes")
                : t("jellysleep.enter_episode_count")}
            </Text>

            <Input
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType='numeric'
              placeholder={t("jellysleep.enter_number_placeholder")}
              className='mb-4'
            />

            <View className='flex-row gap-3 justify-end'>
              <TouchableOpacity
                onPress={closeModal}
                className='bg-neutral-600 px-4 py-2 rounded-md'
              >
                <Text className='text-white text-sm'>{t("common.cancel")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                className='bg-purple-600 px-4 py-2 rounded-md'
              >
                <Text className='text-white text-sm'>{t("common.save")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
