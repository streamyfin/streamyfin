import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
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

export const LiveTVGuideRow = ({
  channel,
  programs,
  scrollX = 0,
  isVisible = true,
  onLongPress,
}: {
  channel: BaseItemDto;
  programs?: BaseItemDto[] | null;
  scrollX?: number;
  isVisible?: boolean;
  onLongPress?: () => void;
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

      // Fill gap before this program
      if (effectiveStart > prevEndTime) {
        const gapWidth = datesToPx(prevEndTime, effectiveStart);
        if (gapWidth > 0) {
          result.push({
            isDummy: true,
            width: gapWidth,
            position: datesToPx(referenceTime, prevEndTime),
            Id: `gap-${channel.Id}-${prevEndTime.getTime()}`,
            startTime: new Date(prevEndTime),
            endTime: new Date(effectiveStart),
          });
        }
      }

      result.push({
        ...program,
        isDummy: false,
        width: datesToPx(effectiveStart, programEnd),
        position: datesToPx(referenceTime, effectiveStart),
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

  if (!isVisible) {
    return <View className='h-16' />;
  }

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

        const cardStyle = {
          position: "absolute" as const,
          left: entry.position + 2,
          top: 3,
          bottom: 3,
          width: entry.width - 4,
          borderRadius: 6,
          backgroundColor: live ? EPG_CARD_BG_LIVE : EPG_CARD_BG_INACTIVE,
          borderWidth: EPG_BORDER_WIDTH,
          borderColor: EPG_BORDER_COLOR,
          overflow: "hidden" as const,
        };

        if (entry.isDummy) {
          return (
            <TouchableItemRouter
              item={channel}
              key={entry.Id}
              onLongPress={onLongPress}
            >
              <View style={cardStyle} />
            </TouchableItemRouter>
          );
        }

        return (
          <TouchableItemRouter
            item={entry}
            key={entry.Id}
            onLongPress={onLongPress}
          >
            <View style={cardStyle}>
              <View
                style={{
                  marginLeft:
                    scrollX > entry.position ? scrollX - entry.position : 0,
                }}
                className='px-3 self-start justify-center flex-1'
              >
                <Text numberOfLines={2} className='text-xs text-start'>
                  {entry.Name}
                </Text>
              </View>
            </View>
          </TouchableItemRouter>
        );
      })}
    </View>
  );
};
