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
import { sleepTimerOptionLabel } from "@/utils/formatDuration";

const optionValue = (o: SleepTimerOption) => o.duration ?? o.episodeCount;

export const SleepTimerOptionsSettings = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  // null = modal closed. `editing` is null when adding.
  const [modal, setModal] = useState<{
    type: SleepTimerType;
    editing: SleepTimerOption | null;
  } | null>(null);
  const [inputValue, setInputValue] = useState("");

  if (!settings) return null;

  const timerOptions = settings.jellysleepTimerOptions || [];
  const save = (jellysleepTimerOptions: SleepTimerOption[]) =>
    updateSettings({ jellysleepTimerOptions });

  const openModal = (
    type: SleepTimerType,
    editing: SleepTimerOption | null,
  ) => {
    setInputValue(editing ? String(optionValue(editing)) : "");
    setModal({ type, editing });
  };

  const addNewOption = () =>
    Alert.alert(
      t("jellysleep.add_timer_option"),
      t("jellysleep.select_timer_type"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("jellysleep.duration_timer"),
          onPress: () => openModal(SleepTimerType.DURATION, null),
        },
        {
          text: t("jellysleep.episode_timer"),
          onPress: () => openModal(SleepTimerType.EPISODE, null),
        },
      ],
    );

  const handleSave = () => {
    if (!modal) return;
    const value = parseInt(inputValue, 10);
    const error = (msg: string) =>
      Alert.alert(t("common.error"), msg, [{ text: t("common.close") }]);
    if (Number.isNaN(value) || value <= 0)
      return error(t("jellysleep.invalid_timer_value"));
    // Options are matched to the server timer by value, so keep them unique.
    if (
      timerOptions.some(
        (o) =>
          o !== modal.editing &&
          o.type === modal.type &&
          optionValue(o) === value,
      )
    )
      return error(t("jellysleep.duplicate_timer"));

    const option: SleepTimerOption = {
      type: modal.type,
      ...(modal.type === SleepTimerType.DURATION
        ? { duration: value }
        : { episodeCount: value }),
    };
    save(
      modal.editing
        ? timerOptions.map((o) => (o === modal.editing ? option : o))
        : [...timerOptions, option],
    );
    setModal(null);
  };

  const deleteOption = (option: SleepTimerOption) =>
    Alert.alert(
      t("jellysleep.delete_timer_option"),
      t("jellysleep.delete_timer_option_confirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => save(timerOptions.filter((o) => o !== option)),
        },
      ],
    );

  const isDuration = modal?.type === SleepTimerType.DURATION;

  return (
    <View className='flex flex-col gap-y-4'>
      <ListGroup title={t("jellysleep.timer_options")}>
        {timerOptions.map((option) => (
          <ListItem
            key={`${option.type}:${optionValue(option)}`}
            title={sleepTimerOptionLabel(option, t)}
          >
            <View className='flex-row items-center gap-1'>
              <TouchableOpacity
                onPress={() => openModal(option.type, option)}
                className='p-1'
              >
                <Ionicons name='pencil' size={16} color='#6b7280' />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deleteOption(option)}
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

      <Modal
        visible={!!modal}
        transparent={true}
        animationType='slide'
        onRequestClose={() => setModal(null)}
      >
        <View className='flex-1 justify-center items-center bg-black/50'>
          <View className='bg-neutral-800 rounded-lg p-6 mx-4 w-80'>
            <Text className='text-white text-lg font-semibold mb-4'>
              {t(
                isDuration
                  ? "jellysleep.duration_timer"
                  : "jellysleep.episode_timer",
              )}
            </Text>

            <Text className='text-neutral-300 text-sm mb-3'>
              {t(
                isDuration
                  ? "jellysleep.enter_minutes"
                  : "jellysleep.enter_episode_count",
              )}
            </Text>

            <Input
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType='numeric'
              extraClassName='mb-4'
            />

            <View className='flex-row gap-3 justify-end'>
              <TouchableOpacity
                onPress={() => setModal(null)}
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
