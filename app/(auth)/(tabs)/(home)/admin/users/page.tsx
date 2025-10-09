import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserCard } from "@/components/admin/UserCard";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { apiAtom } from "@/providers/JellyfinProvider";

export default function UsersPage() {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const {
    data: users,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      if (!api) throw new Error("No API available");
      const response = await getUserApi(api).getUsers();
      return response.data || [];
    },
    enabled: !!api,
    staleTime: 30 * 1000, // 30 seconds
  });

  if (isLoading) {
    return (
      <View className='flex-1 justify-center items-center'>
        <Loader />
      </View>
    );
  }

  if (error) {
    return (
      <View className='flex-1 justify-center items-center p-4'>
        <Text className='text-red-500 text-center'>
          {t("admin.users.error_loading_users")}
        </Text>
      </View>
    );
  }

  const renderUserItem = ({ item }: { item: UserDto }) => (
    <UserCard user={item} />
  );

  return (
    <View
      className='flex-1 bg-black'
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className='px-4 py-4'>
        <Text className='text-2xl font-bold text-white mb-2'>
          {t("admin.users.title", "Manage Users")}
        </Text>
        <Text className='text-neutral-400 mb-4'>
          {t("admin.users.subtitle", `${users?.length || 0} users found`)}
        </Text>
      </View>

      <FlashList
        data={users}
        renderItem={renderUserItem}
        keyExtractor={(item) => item.Id || "unknown"}
        estimatedItemSize={80}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 16,
        }}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View className='h-2' />}
      />
    </View>
  );
}
