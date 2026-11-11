import { View } from "react-native";
import { LIVE_TV_GUIDE_HOUR_WIDTH } from "@/constants/LiveTVGuide";
import { Text } from "../common/Text";

/** The guide's hours, from `startTime` to midnight. */
export const HourHeader = ({
  height,
  startTime,
}: {
  height: number;
  /** The first hour shown, the same the channel rows count from. */
  startTime: number;
}) => {
  const hours = generateHours(new Date(startTime));

  return (
    <View
      className='flex flex-row'
      style={{
        height,
      }}
    >
      {hours.map((hour, index) => (
        <HourCell key={index} hour={hour} />
      ))}
    </View>
  );
};

const HourCell = ({ hour }: { hour: Date }) => (
  <View
    style={{ width: LIVE_TV_GUIDE_HOUR_WIDTH }}
    className='flex items-center justify-center bg-neutral-800'
  >
    <Text className='text-xs text-gray-600'>
      {hour.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </Text>
  </View>
);

const generateHours = (start: Date): Date[] =>
  Array.from({ length: 24 - start.getHours() }, (_, i) => {
    const hour = new Date(start);
    hour.setHours(start.getHours() + i, 0, 0, 0);
    return hour;
  });
