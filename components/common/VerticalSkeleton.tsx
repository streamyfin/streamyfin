import { Text } from "@/components/common/Text";
import { View, type ViewProps } from "react-native";

interface Props extends ViewProps {
  index: number;
}

export const VerticalSkeleton: React.FC<Props> = ({ index, ...props }) => {
  return (
    <View
      key={index}
      style={{
        width: "32%",
      }}
      className='flex flex-col'
      {...props}
    >
      <View
        style={{
          aspectRatio: "10/15",
        }}
        className='w-full bg-neutral-800 mb-2 rounded-lg'
      ></View>
      <View className='h-2 bg-neutral-800 rounded-full mb-1'></View>
      <View className='h-2 bg-neutral-800 rounded-full mb-1'></View>
      <View className='h-2 bg-neutral-800 rounded-full mb-2 w-1/2'></View>
    </View>
  );
};
