import type { FC } from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { formatTimeString } from "@/utils/time";

interface TimeDisplayProps {
  currentTime: number;
  remainingTime: number;
  isVlc: boolean;
}

export const TimeDisplay: FC<TimeDisplayProps> = ({
  currentTime,
  remainingTime,
  isVlc,
}) => {
  const getFinishTime = () => {
    const now = new Date();
    const remainingMs = isVlc ? remainingTime : remainingTime * 1000;
    const finishTime = new Date(now.getTime() + remainingMs);
    return finishTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <View className='flex flex-row items-center justify-between mt-2'>
      <Text className='text-[12px] text-neutral-400'>
        {formatTimeString(currentTime, isVlc ? "ms" : "s")}
      </Text>
      <View className='flex flex-col items-end'>
        <Text className='text-[12px] text-neutral-400'>
          -{formatTimeString(remainingTime, isVlc ? "ms" : "s")}
        </Text>
        <Text className='text-[10px] text-neutral-500 opacity-70'>
          ends at {getFinishTime()}
        </Text>
      </View>
    </View>
  );
};
