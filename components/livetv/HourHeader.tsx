import { View } from "react-native";
import { Text } from "../common/Text";
import {
  EPG_BORDER_WIDTH,
  EPG_CARD_BG_LIVE,
  EPG_PX_PER_HOUR,
  EPG_SUBTLE_COLOR,
  EPG_TEXT_COLOR_PRIMARY,
  EPG_TEXT_COLOR_SECONDARY,
  getGuideReferenceTime,
} from "./constants";

const LABEL_WIDTH = 56;
const TICK_HEIGHT_FULL = 5;
const TICK_HEIGHT_HALF = 3;

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const HourHeader = ({ height }: { height: number }) => {
  const referenceTime = getGuideReferenceTime();
  const totalWidth = 24 * EPG_PX_PER_HOUR;

  const labels: { time: Date; x: number }[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = new Date(referenceTime.getTime() + i * 30 * 60 * 1000);
    labels.push({ time: t, x: (i * EPG_PX_PER_HOUR) / 2 });
  }

  return (
    <View
      style={{
        width: totalWidth,
        height,
        backgroundColor: EPG_CARD_BG_LIVE,
        borderBottomWidth: EPG_BORDER_WIDTH,
        borderBottomColor: EPG_SUBTLE_COLOR,
      }}
    >
      {labels.map(({ time, x }, index) => {
        const isFullHour = time.getMinutes() === 0;
        return (
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
            <Text
              style={{
                fontSize: isFullHour ? 12 : 11,
                color: isFullHour
                  ? EPG_TEXT_COLOR_PRIMARY
                  : EPG_TEXT_COLOR_SECONDARY,
              }}
            >
              {index === 0
                ? `:${String(time.getMinutes()).padStart(2, "0")}`
                : formatTime(time)}
            </Text>
            {/* Tick mark at bottom */}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                width: EPG_BORDER_WIDTH,
                height: isFullHour ? TICK_HEIGHT_FULL : TICK_HEIGHT_HALF,
                backgroundColor: EPG_SUBTLE_COLOR,
              }}
            />
          </View>
        );
      })}
    </View>
  );
};
