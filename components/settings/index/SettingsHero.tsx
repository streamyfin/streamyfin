import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAtom } from "jotai";
import type React from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

export const SettingsHero: React.FC<{ onPress: () => void }> = ({
  onPress,
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const connected = Boolean(api && user);
  const imageUrl =
    api && user?.Id && user.PrimaryImageTag
      ? `${api.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&quality=90`
      : undefined;
  const host = api?.basePath?.replace(/^https?:\/\//, "");

  return (
    <TouchableOpacity
      onPress={onPress}
      className='mx-3 mb-4 rounded-2xl overflow-hidden'
    >
      <LinearGradient
        colors={["#241b33", "#15151a"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View className='flex-row items-center p-4'>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: 52, height: 52, borderRadius: 26 }}
            />
          ) : (
            <LinearGradient
              colors={["#a855f7", "#6d28d9"]}
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text className='text-white text-[22px] font-bold'>
                {(user?.Name?.[0] ?? "?").toUpperCase()}
              </Text>
            </LinearGradient>
          )}
          <View className='flex-1 ml-3'>
            <Text
              className='text-white text-[18px] font-bold'
              numberOfLines={1}
            >
              {user?.Name ?? ""}
            </Text>
            <View className='flex-row items-center mt-0.5'>
              <View
                className='w-2 h-2 rounded-full mr-1.5'
                style={{ backgroundColor: connected ? "#30D158" : "#8E8D91" }}
              />
              <Text className='text-[#9899A1] text-[13px]' numberOfLines={1}>
                {host}
              </Text>
            </View>
          </View>
          <Ionicons name='chevron-forward' size={18} color='#5A5960' />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};
