import type React from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";

export const SettingsSection: React.FC<{
  title?: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <View className='mb-5'>
    {title ? (
      <Text className='ml-4 mb-1.5 uppercase text-[#8E8D91] text-[11px] tracking-wide'>
        {title}
      </Text>
    ) : null}
    <View className='mx-3 rounded-xl overflow-hidden bg-neutral-900'>
      {children}
    </View>
  </View>
);
