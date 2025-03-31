import { Image } from "expo-image";
import { View } from "react-native";

export const LargePoster: React.FC<{ url?: string | null }> = ({ url }) => {
  if (!url)
    return (
      <View className='p-4 rounded-xl overflow-hidden '>
        <View className='w-full aspect-video rounded-xl overflow-hidden border border-neutral-800' />
      </View>
    );

  return (
    <View className='p-4 rounded-xl overflow-hidden '>
      <Image
        source={{ uri: url }}
        className='w-full aspect-video rounded-xl overflow-hidden border border-neutral-800'
      />
    </View>
  );
};
