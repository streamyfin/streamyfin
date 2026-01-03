import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useCreateWatchlist } from "@/hooks/useWatchlistMutations";
import type {
  StreamystatsWatchlistAllowedItemType,
  StreamystatsWatchlistSortOrder,
} from "@/utils/streamystats/types";

const ITEM_TYPES: Array<{
  value: StreamystatsWatchlistAllowedItemType;
  label: string;
}> = [
  { value: null, label: "All Types" },
  { value: "Movie", label: "Movies Only" },
  { value: "Series", label: "Series Only" },
  { value: "Episode", label: "Episodes Only" },
];

const SORT_OPTIONS: Array<{
  value: StreamystatsWatchlistSortOrder;
  label: string;
}> = [
  { value: "custom", label: "Custom Order" },
  { value: "name", label: "Name" },
  { value: "dateAdded", label: "Date Added" },
  { value: "releaseDate", label: "Release Date" },
];

export default function CreateWatchlistScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const createWatchlist = useCreateWatchlist();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [allowedItemType, setAllowedItemType] =
    useState<StreamystatsWatchlistAllowedItemType>(null);
  const [defaultSortOrder, setDefaultSortOrder] =
    useState<StreamystatsWatchlistSortOrder>("custom");

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;

    try {
      await createWatchlist.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
        allowedItemType,
        defaultSortOrder,
      });
      router.back();
    } catch {
      // Error handled by mutation
    }
  }, [
    name,
    description,
    isPublic,
    allowedItemType,
    defaultSortOrder,
    createWatchlist,
    router,
  ]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className='flex-1'
      style={{ backgroundColor: "#171717" }}
    >
      <ScrollView
        className='flex-1'
        contentContainerStyle={{
          paddingBottom: insets.bottom + 20,
        }}
        keyboardShouldPersistTaps='handled'
      >
        {/* Name */}
        <View className='px-4 py-4'>
          <Text className='text-sm font-medium text-neutral-400 mb-2'>
            {t("watchlists.name_label")} *
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("watchlists.name_placeholder")}
            placeholderTextColor='#6b7280'
            className='bg-neutral-800 text-white px-4 py-3 rounded-lg text-base'
            autoFocus
          />
        </View>

        {/* Description */}
        <View className='px-4 py-4'>
          <Text className='text-sm font-medium text-neutral-400 mb-2'>
            {t("watchlists.description_label")}
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("watchlists.description_placeholder")}
            placeholderTextColor='#6b7280'
            className='bg-neutral-800 text-white px-4 py-3 rounded-lg text-base'
            multiline
            numberOfLines={3}
            textAlignVertical='top'
            style={{ minHeight: 80 }}
          />
        </View>

        {/* Public Toggle */}
        <View className='px-4 py-4 flex-row items-center justify-between'>
          <View className='flex-1 mr-4'>
            <Text className='text-base font-medium text-white'>
              {t("watchlists.is_public_label")}
            </Text>
            <Text className='text-sm text-neutral-400 mt-1'>
              {t("watchlists.is_public_description")}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: "#374151", true: "#7c3aed" }}
            thumbColor={isPublic ? "#a78bfa" : "#9ca3af"}
          />
        </View>

        {/* Content Type */}
        <View className='px-4 py-4'>
          <Text className='text-sm font-medium text-neutral-400 mb-2'>
            {t("watchlists.allowed_type_label")}
          </Text>
          <View className='flex-row flex-wrap gap-2'>
            {ITEM_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value ?? "all"}
                onPress={() => setAllowedItemType(type.value)}
                className={`px-4 py-2 rounded-lg ${allowedItemType === type.value ? "bg-purple-600" : "bg-neutral-800"}`}
              >
                <Text
                  className={
                    allowedItemType === type.value
                      ? "text-white font-medium"
                      : "text-neutral-300"
                  }
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sort Order */}
        <View className='px-4 py-4'>
          <Text className='text-sm font-medium text-neutral-400 mb-2'>
            {t("watchlists.sort_order_label")}
          </Text>
          <View className='flex-row flex-wrap gap-2'>
            {SORT_OPTIONS.map((sort) => (
              <TouchableOpacity
                key={sort.value}
                onPress={() => setDefaultSortOrder(sort.value)}
                className={`px-4 py-2 rounded-lg ${defaultSortOrder === sort.value ? "bg-purple-600" : "bg-neutral-800"}`}
              >
                <Text
                  className={
                    defaultSortOrder === sort.value
                      ? "text-white font-medium"
                      : "text-neutral-300"
                  }
                >
                  {sort.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Create Button */}
        <View className='px-4 pt-4'>
          <Button
            onPress={handleCreate}
            disabled={!name.trim() || createWatchlist.isPending}
            className={`py-3 ${!name.trim() ? "opacity-50" : ""}`}
          >
            {createWatchlist.isPending ? (
              <ActivityIndicator color='white' />
            ) : (
              <View className='flex-row items-center'>
                <Ionicons name='add' size={20} color='white' />
                <Text className='text-white font-semibold text-base'>
                  {t("watchlists.create_button")}
                </Text>
              </View>
            )}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
