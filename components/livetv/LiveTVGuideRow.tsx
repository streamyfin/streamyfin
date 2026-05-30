import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Text } from "../common/Text";
import {
  EPG_BORDER_COLOR,
  EPG_BORDER_WIDTH,
  EPG_CARD_BG_INACTIVE,
  EPG_CARD_BG_LIVE,
  EPG_PX_PER_HOUR,
  getGuideReferenceTime,
} from "./constants";

type RealEntry = BaseItemDto & {
  isDummy: false;
  width: number;
  position: number;
};
type DummyEntry = {
  isDummy: true;
  width: number;
  position: number;
  Id: string;
  startTime: Date;
  endTime: Date;
};
type GuideEntry = RealEntry | DummyEntry;

const datesToPx = (start: Date, end: Date): number =>
  Math.max(
    0,
    ((end.getTime() - start.getTime()) / 60000 / 60) * EPG_PX_PER_HOUR,
  );

// Separate component so useAnimatedStyle is called at component level, not inside a loop
const ProgramCard: React.FC<{
  entry: RealEntry;
  wrapperStyle: object;
  innerStyle: object;
  scrollXShared: SharedValue<number>;
  onPress: () => void;
  onLongPress: (item: BaseItemDto) => void;
}> = ({
  entry,
  wrapperStyle,
  innerStyle,
  scrollXShared,
  onPress,
  onLongPress,
}) => {
  const textStyle = useAnimatedStyle(() => ({
    marginLeft:
      scrollXShared.value > entry.position
        ? scrollXShared.value - entry.position
        : 0,
  }));

  return (
    <TouchableOpacity
      style={wrapperStyle}
      onPress={onPress}
      onLongPress={() => onLongPress(entry)}
    >
      <View style={innerStyle}>
        <Animated.View
          style={textStyle}
          className='px-3 self-start justify-center flex-1'
        >
          <Text numberOfLines={2} className='text-xs text-start'>
            {entry.Name}
          </Text>
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
};

export const LiveTVGuideRow = ({
  channel,
  programs,
  scrollXShared,
  onPress,
  onLongPress,
}: {
  channel: BaseItemDto;
  programs?: BaseItemDto[] | null;
  scrollXShared: SharedValue<number>;
  onPress: () => void;
  onLongPress: (item: BaseItemDto) => void;
}) => {
  const referenceTime = useMemo(() => getGuideReferenceTime(), []);

  const programsWithGaps = useMemo((): GuideEntry[] => {
    const endOfDay = new Date(referenceTime.getTime() + 24 * 60 * 60 * 1000);

    const channelPrograms = (programs ?? [])
      .filter((p) => p.ChannelId === channel.Id)
      .sort(
        (a, b) =>
          new Date(a.StartDate ?? 0).getTime() -
          new Date(b.StartDate ?? 0).getTime(),
      );

    const result: GuideEntry[] = [];
    let prevEndTime = new Date(referenceTime);

    for (const program of channelPrograms) {
      const programStart = new Date(program.StartDate ?? 0);
      const programEnd = new Date(program.EndDate ?? 0);
      const effectiveStart =
        programStart > referenceTime ? programStart : referenceTime;

      // Skip programs fully covered by a previous one
      if (programEnd <= prevEndTime) continue;

      // Clip start if overlapping with previous program
      const clippedStart =
        effectiveStart < prevEndTime ? prevEndTime : effectiveStart;

      // Fill gap before this program
      if (clippedStart > prevEndTime) {
        const gapWidth = datesToPx(prevEndTime, clippedStart);
        if (gapWidth > 0) {
          result.push({
            isDummy: true,
            width: gapWidth,
            position: datesToPx(referenceTime, prevEndTime),
            Id: `gap-${channel.Id}-${prevEndTime.getTime()}`,
            startTime: new Date(prevEndTime),
            endTime: new Date(clippedStart),
          });
        }
      }

      result.push({
        ...program,
        isDummy: false,
        width: datesToPx(clippedStart, programEnd),
        position: datesToPx(referenceTime, clippedStart),
      });

      if (programEnd > prevEndTime) prevEndTime = new Date(programEnd);
    }

    // Fill remaining time after last program
    if (prevEndTime < endOfDay) {
      const remainingWidth = datesToPx(prevEndTime, endOfDay);
      if (remainingWidth > 0) {
        result.push({
          isDummy: true,
          width: remainingWidth,
          position: datesToPx(referenceTime, prevEndTime),
          Id: `gap-end-${channel.Id}`,
          startTime: new Date(prevEndTime),
          endTime: new Date(endOfDay),
        });
      }
    }

    // Empty channel – fill entire visible time range
    if (result.length === 0) {
      result.push({
        isDummy: true,
        width: Math.max(datesToPx(referenceTime, endOfDay), EPG_PX_PER_HOUR),
        position: 0,
        Id: `empty-${channel.Id}`,
        startTime: new Date(referenceTime),
        endTime: new Date(endOfDay),
      });
    }

    return result;
  }, [programs, channel.Id, referenceTime]);

  const now = new Date();

  return (
    <View className='flex-row h-16'>
      {programsWithGaps.map((entry) => {
        const live = entry.isDummy
          ? now >= entry.startTime && now <= entry.endTime
          : !!entry.StartDate &&
            !!entry.EndDate &&
            now >= new Date(entry.StartDate) &&
            now <= new Date(entry.EndDate);

        const wrapperStyle = {
          position: "absolute" as const,
          left: entry.position + 2,
          top: 3,
          bottom: 3,
          width: entry.width - 4,
        };

        const innerStyle = {
          flex: 1,
          borderRadius: 6,
          backgroundColor: live ? EPG_CARD_BG_LIVE : EPG_CARD_BG_INACTIVE,
          borderWidth: EPG_BORDER_WIDTH,
          borderColor: EPG_BORDER_COLOR,
          overflow: "hidden" as const,
        };

        if (entry.isDummy) {
          return (
            <TouchableOpacity
              key={entry.Id}
              style={wrapperStyle}
              onPress={onPress}
              onLongPress={() => onLongPress(channel)}
            >
              <View style={innerStyle} />
            </TouchableOpacity>
          );
        }

        return (
          <ProgramCard
            key={entry.Id}
            entry={entry}
            wrapperStyle={wrapperStyle}
            innerStyle={innerStyle}
            scrollXShared={scrollXShared}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
  );
};
