import { Ionicons } from "@expo/vector-icons";
import { t } from "i18next";
import type React from "react";
import { TextInput, View } from "react-native";

export const SettingsSearchBar: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => (
  <View className='mx-3 mb-4 h-[38px] rounded-xl bg-neutral-800 flex-row items-center px-3'>
    <Ionicons name='search' size={16} color='#76767c' />
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={t("home.settings.search_placeholder")}
      placeholderTextColor='#76767c'
      className='flex-1 ml-2 text-white text-[15px]'
      autoCapitalize='none'
      autoCorrect={false}
      clearButtonMode='while-editing'
    />
  </View>
);
