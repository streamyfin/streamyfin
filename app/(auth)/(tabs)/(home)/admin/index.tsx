import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtom } from "jotai";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdminInfo } from "@/components/admin/AdminInfo";
import { AdminManage } from "@/components/admin/AdminManage";
import { Loader } from "@/components/Loader";
import { useSessions, useSessionsProps } from "@/hooks/useSessions";
import { apiAtom } from "@/providers/JellyfinProvider";

export default function page() {
  const { sessions, isLoading } = useSessions({} as useSessionsProps);
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [_users, setUsers] = React.useState<any[]>([]);

  const getUsers = async () => {
    const users = await getUserApi(api!).getUsers();
    return users;
  };

  useEffect(() => {
    getUsers().then((users) => {
      setUsers(users.data);
    });
  }, []);

  if (isLoading)
    return (
      <View className='justify-center items-center h-full'>
        <Loader />
      </View>
    );

  return (
    <ScrollView
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className='p-4 flex flex-col gap-y-4'>
        <AdminInfo />

        <AdminManage />
      </View>
    </ScrollView>
  );
}
