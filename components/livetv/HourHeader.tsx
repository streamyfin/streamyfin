import { View } from "react-native";
import {
  LIVE_TV_GUIDE_HOUR_MS,
  LIVE_TV_GUIDE_HOUR_WIDTH,
} from "@/constants/LiveTVGuide";
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
  const hours = guideHours(startTime);

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

/**
 * The guide's hours from `startTime` to the next local midnight, one elapsed
 * hour apart, as the rows place programs. Stepping the local hour instead, a
 * spring-forward day showed 3:00 twice and the header ran an hour off them.
 */
export const guideHours = (startTime: number): Date[] => {
  const midnight = new Date(startTime);
  midnight.setHours(24, 0, 0, 0);
  const hours: Date[] = [];
  for (
    let time = startTime;
    time < midnight.getTime();
    time += LIVE_TV_GUIDE_HOUR_MS
  ) {
    hours.push(new Date(time));
  }
  return hours;
};
