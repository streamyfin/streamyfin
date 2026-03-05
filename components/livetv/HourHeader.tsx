import { View } from "react-native";
import { Text } from "../common/Text";
import { EPG_PX_PER_HOUR, getGuideReferenceTime } from "./constants";

const LABEL_WIDTH = 56;

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const HourHeader = ({ height }: { height: number }) => {
  const referenceTime = getGuideReferenceTime();
  const totalWidth = 24 * EPG_PX_PER_HOUR;

  // One label every half hour over 24 hours (48 steps + final boundary)
  const labels: { time: Date; x: number }[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = new Date(referenceTime.getTime() + i * 30 * 60 * 1000);
    labels.push({ time: t, x: (i * EPG_PX_PER_HOUR) / 2 });
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
            {index === 0
              ? `:${String(time.getMinutes()).padStart(2, "0")}`
              : formatTime(time)}
          </Text>
        </View>
      ))}
    </View>
  );
};
