import { View } from "react-native";
import { Text } from "../common/Text";
import { EPG_PX_PER_HOUR } from "./constants";

const LABEL_WIDTH = 56;

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const HourHeader = ({ height }: { height: number }) => {
  const now = new Date();
  const currentHour = now.getHours();
  const hoursRemaining = 24 - currentHour;
  const totalWidth = hoursRemaining * EPG_PX_PER_HOUR;

  const labels: { time: Date; x: number }[] = [];
  for (let i = 0; i <= hoursRemaining; i++) {
    const hour = new Date(now);
    hour.setHours(currentHour + i, 0, 0, 0);
    labels.push({ time: hour, x: i * EPG_PX_PER_HOUR });
    if (i < hoursRemaining) {
      const half = new Date(hour);
      half.setMinutes(30);
      labels.push({ time: half, x: i * EPG_PX_PER_HOUR + EPG_PX_PER_HOUR / 2 });
    }
  }

  return (
    <View style={{ width: totalWidth, height }} className='bg-neutral-800'>
      {labels.map(({ time, x }, index) => (
        <View
          key={x}
          style={{
            position: "absolute",
            left: Math.max(0, x - LABEL_WIDTH / 2),
            top: 0,
            bottom: 0,
            width: LABEL_WIDTH,
            alignItems: index === 0 ? "flex-start" : "center",
            justifyContent: "center",
          }}
        >
          <Text className='text-xs text-neutral-300'>
            {index === 0 ? ":00" : formatTime(time)}
          </Text>
        </View>
      ))}
    </View>
  );
};
