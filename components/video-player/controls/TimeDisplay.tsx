import type { FC } from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { formatTimeString } from "@/utils/time";

interface TimeDisplayProps {
  currentTime: number;
  remainingTime: number;
}

/**
 * Displays current time and remaining time.
 * MPV player uses milliseconds for time values.
 */
export const TimeDisplay: FC<TimeDisplayProps> = ({
  currentTime,
  remainingTime,
}) => {
  const getFinishTime = () => {
    const now = new Date();
    // remainingTime is in ms
    const finishTime = new Date(now.getTime() + remainingTime);
    return finishTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <View className='flex flex-row items-center justify-between mt-2'>
      <Text className='text-[12px] text-neutral-400'>
        {formatTimeString(currentTime, "ms")}
      </Text>
      <View className='flex flex-col items-end'>
        <Text className='text-[12px] text-neutral-400'>
          -{formatTimeString(remainingTime, "ms")}
        </Text>
        <Text className='text-[10px] text-neutral-500 opacity-70'>
          ends at {getFinishTime()}
        </Text>
      </View>
    </View>
  );
};
